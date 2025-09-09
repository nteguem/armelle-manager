import type { IncomingMessage, OutgoingMessage, SessionContext } from '#bot/types/bot_types'
import type { StateContext } from '#bot/types/state.types'
import { BotState } from '#bot/types/state.types'
import { StateController } from '../state/state_controller.js'
import { CommandHandler } from '../handlers/command_handler.js'
import { AIHandler } from '../handlers/ai_handler.js'
import { WorkflowRegistry } from '../workflow/registry/workflow_registry.js'
import { WorkflowServiceRegistry } from '../workflow/services/workflow_service_registry.js'
import { WorkflowExecutor } from '../workflow/engine/workflow_executor.js'
import { WorkflowContextFactory } from '../workflow/engine/workflow_context.js'
import SessionManager from '#bot/core/managers/session_manager'
import BotMessage from '#models/bot/bot_message'
import BotSession from '#models/bot/bot_session'
import logger from '@adonisjs/core/services/logger'

export class BotOrchestrator {
  private stateController: StateController
  private sessionManager: SessionManager
  private workflowRegistry: WorkflowRegistry

  private commandHandler: CommandHandler
  private aiHandler: AIHandler

  private activeWorkflows: Map<string, WorkflowExecutor> = new Map()
  private adapters: Map<string, any> = new Map()

  constructor() {
    this.stateController = StateController.getInstance()
    this.sessionManager = SessionManager.getInstance()
    this.workflowRegistry = WorkflowRegistry.getInstance()

    this.commandHandler = new CommandHandler()
    this.aiHandler = new AIHandler()
  }

  registerAdapter(channel: string, adapter: any): void {
    this.adapters.set(channel, adapter)
  }

  async processMessage(message: IncomingMessage): Promise<void> {
    const startTime = Date.now()

    try {
      const session = await this.sessionManager.getOrCreateSession(message.channel, message.from)

      const stateContext = this.stateController.getStateContext(session)

      await this.saveIncomingMessage(message, session)

      const response = await this.route(stateContext, message.text)

      if (response) {
        await this.sendResponse(response, message, session)
      }

      const duration = Date.now() - startTime
      logger.info(
        {
          channel: message.channel,
          from: message.from,
          state: stateContext.currentState,
          duration,
        },
        'Message processed'
      )
    } catch (error: any) {
      logger.error(
        {
          error: error.message,
          message,
        },
        'Failed to process message'
      )

      await this.sendErrorResponse(message)
    }
  }

  private async route(context: StateContext, input: string): Promise<string | null> {
    const currentState = context.currentState

    // Workflows système (onboarding)
    if (currentState === BotState.UNVERIFIED || currentState === BotState.SYSTEM_WORKFLOW) {
      return this.handleSystemWorkflow(context, input)
    }

    // Vérifier les commandes en premier
    if (this.commandHandler.canHandle(context, input)) {
      const result = await this.commandHandler.handle(context, input)

      if (result.nextState) {
        await this.stateController.transition(
          context,
          result.nextState as BotState,
          'command',
          result.stateData
        )
      }

      return result.message || null
    }

    // Workflow utilisateur en cours
    if (currentState === BotState.USER_WORKFLOW) {
      return this.handleUserWorkflow(context, input)
    }

    // Sélection dans le menu
    if (currentState === BotState.MENU_DISPLAYED) {
      return this.handleMenuSelection(context, input)
    }

    // États IA - CORRECTION CRITIQUE ICI
    if (currentState === BotState.IDLE || currentState === BotState.AI_WAITING_CONFIRM) {
      const result = await this.aiHandler.handle(context, input)

      // Log pour debug
      logger.info(
        {
          currentState,
          resultNextState: result.nextState,
          resultStateData: result.stateData,
          hasWorkflowId: !!result.stateData?.workflowId,
        },
        'AI Handler result'
      )

      // Si l'IA veut changer d'état ET que c'est possible
      if (result.nextState && result.nextState !== currentState) {
        const canTransition = await this.stateController.canTransition(
          context,
          result.nextState as BotState
        )

        if (canTransition) {
          await this.stateController.transition(
            context,
            result.nextState as BotState,
            'ai_response',
            result.stateData
          )

          // CORRECTION: Si on vient de transitionner vers USER_WORKFLOW, lancer le workflow
          if (result.nextState === BotState.USER_WORKFLOW && result.stateData?.workflowId) {
            logger.info(
              {
                workflowId: result.stateData.workflowId,
                currentState: context.currentState,
              },
              'Starting workflow after state transition'
            )

            return this.startWorkflow(context, result.stateData.workflowId)
          }
        }
      }

      return result.message || null
    }

    return this.handleFallback(context, input)
  }

  private async handleSystemWorkflow(context: StateContext, input: string): Promise<string | null> {
    const sessionKey = this.getSessionKey(context.session)

    if (context.currentState === BotState.UNVERIFIED) {
      const workflow = this.workflowRegistry.get('onboarding')
      if (!workflow) {
        logger.error('Onboarding workflow not found')
        return null
      }

      const workflowContext = WorkflowContextFactory.create('onboarding', context.session)
      const executor = new WorkflowExecutor(workflow, workflowContext)

      const serviceRegistry = WorkflowServiceRegistry.getInstance()
      const services = serviceRegistry.getAll()
      for (const [name, service] of services) {
        executor.registerService(name, service)
      }

      this.activeWorkflows.set(sessionKey, executor)

      const result = await executor.start()

      await this.stateController.transition(context, BotState.SYSTEM_WORKFLOW, 'onboarding_start')

      return result.message || null
    }

    const executor = this.activeWorkflows.get(sessionKey)
    if (!executor) {
      logger.error('No active system workflow')
      return null
    }

    const result = await executor.processInput(input)

    if (result.completed) {
      this.activeWorkflows.delete(sessionKey)

      const data = executor.getContext().state.data
      if (data.finalize && data.finalize.success) {
        await this.sessionManager.updateSessionContext(context.session, {
          isVerified: true,
          workflowData: {
            userData: data.finalize.taxpayerData || { name: data.finalize.userName },
          },
        })

        await this.stateController.transition(context, BotState.IDLE, 'onboarding_complete')
      }
    }

    return result.message || null
  }

  private async handleUserWorkflow(context: StateContext, input: string): Promise<string | null> {
    const sessionKey = this.getSessionKey(context.session)
    const executor = this.activeWorkflows.get(sessionKey)

    if (!executor) {
      logger.error('No active user workflow')
      await this.stateController.transition(context, BotState.IDLE, 'workflow_lost')
      return null
    }

    const result = await executor.processInput(input)

    if (result.completed) {
      this.activeWorkflows.delete(sessionKey)
      await this.stateController.transition(context, BotState.IDLE, 'workflow_complete')
    }

    return result.message || null
  }

  private async handleMenuSelection(context: StateContext, input: string): Promise<string | null> {
    const selection = Number.parseInt(input.trim(), 10)

    if (Number.isNaN(selection)) {
      await this.stateController.transition(context, BotState.IDLE, 'invalid_selection')
      return 'Sélection invalide. Que puis-je faire pour vous ?'
    }

    if (selection === 0) {
      await this.stateController.transition(context, BotState.IDLE, 'menu_back')
      return 'Je suis là pour vous aider. Que puis-je faire pour vous ?'
    }

    // Récupérer correctement les options du menu depuis stateData
    const menuOptions = context.stateData?.menuOptions || []
    const workflowId = menuOptions[selection - 1]

    logger.info(
      {
        selection,
        menuOptions,
        workflowId,
      },
      'Menu selection processing'
    )

    if (!workflowId) {
      await this.stateController.transition(context, BotState.IDLE, 'invalid_menu_selection')
      return 'Sélection invalide. Que puis-je faire pour vous ?'
    }

    // Transition vers USER_WORKFLOW puis démarrer le workflow
    await this.stateController.transition(context, BotState.USER_WORKFLOW, 'menu_selection', {
      workflowId,
    })

    return this.startWorkflow(context, workflowId)
  }

  private async startWorkflow(context: StateContext, workflowId: string): Promise<string | null> {
    const workflow = this.workflowRegistry.get(workflowId)
    if (!workflow) {
      logger.error({ workflowId }, 'Workflow not found')
      return null
    }

    const workflowContext = WorkflowContextFactory.create(workflowId, context.session)
    const executor = new WorkflowExecutor(workflow, workflowContext)

    const serviceRegistry = WorkflowServiceRegistry.getInstance()
    const services = serviceRegistry.getAll()
    for (const [name, service] of services) {
      executor.registerService(name, service)
    }

    const sessionKey = this.getSessionKey(context.session)
    this.activeWorkflows.set(sessionKey, executor)

    const result = await executor.start()

    // CORRECTION: Ne pas faire de transition ici car on est déjà en USER_WORKFLOW
    // Seulement logguer le démarrage
    logger.info(
      {
        workflowId,
        sessionKey,
        stepId: result.nextStepId,
        currentState: context.currentState,
      },
      'Workflow started successfully'
    )

    return result.message || null
  }

  private async handleFallback(context: StateContext, input: string): Promise<string> {
    logger.warn(
      {
        state: context.currentState,
        input,
      },
      'Fallback handler'
    )

    return 'Je ne comprends pas. Tapez "menu" pour voir les options ou posez-moi une question.'
  }

  private async saveIncomingMessage(
    message: IncomingMessage,
    session: SessionContext
  ): Promise<void> {
    const botSession = await BotSession.findActiveSession(message.channel, message.from)

    if (botSession) {
      await BotMessage.createIncoming({
        session: botSession,
        content: message.text,
        messageType: message.type,
        rawData: message.metadata || {},
      })
    }
  }

  private async sendResponse(
    content: string,
    originalMessage: IncomingMessage,
    session: SessionContext
  ): Promise<void> {
    const botSession = await BotSession.findActiveSession(
      originalMessage.channel,
      originalMessage.from
    )

    if (botSession) {
      await BotMessage.createOutgoing({
        session: botSession,
        content,
        messageType: 'text',
      })
    }

    const adapter = this.adapters.get(originalMessage.channel)
    if (adapter) {
      const outgoing: OutgoingMessage = {
        to: originalMessage.from,
        text: content,
        type: 'text',
      }
      await adapter.sendMessage(outgoing)
    }
  }

  private async sendErrorResponse(originalMessage: IncomingMessage): Promise<void> {
    const adapter = this.adapters.get(originalMessage.channel)
    if (adapter) {
      await adapter.sendMessage({
        to: originalMessage.from,
        text: "Désolé, une erreur s'est produite. Veuillez réessayer.",
        type: 'text',
      })
    }
  }

  private getSessionKey(session: SessionContext): string {
    return `${session.channel}:${session.channelUserId}`
  }
}
