import type { IncomingMessage, OutgoingMessage, BotSessionExtended } from '#bot/types/bot_types'
import BotMessage from '#models/bot_message'
import BotUser from '#models/bot_user'
import I18nManager from './i18n_manager.js'
import MessageBuilder from './message_builder.js'
import CommandSystem from './command_system.js'
import WorkflowEngine from '../workflows/workflow_engine.js'
import SessionManager from '#bot/services/session_manager'
import WhatsAppAdapter from './adapters/whatsapp_adapter.js'
import { OnboardingWorkflow } from '#bot/workflows/implementations/onboarding_workflow'
import DGIScraperService from '#bot/services/dgi_scraper_service'
import logger from '@adonisjs/core/services/logger'

export default class BotEngine {
  private readonly i18n: I18nManager
  private readonly messageBuilder: MessageBuilder
  private readonly commandSystem: CommandSystem
  private readonly workflowEngine: WorkflowEngine
  private readonly sessionManager: SessionManager
  private readonly whatsappAdapter: WhatsAppAdapter

  constructor() {
    this.i18n = I18nManager.getInstance()
    this.messageBuilder = new MessageBuilder()
    this.sessionManager = new SessionManager()
    this.workflowEngine = new WorkflowEngine(this.sessionManager)
    this.commandSystem = new CommandSystem()
    this.whatsappAdapter = new WhatsAppAdapter()
  }

  public async initialize(): Promise<void> {
    // 1. Initialiser I18n
    await this.i18n.initialize()
    logger.info('I18nManager initialized')

    // 2. Enregistrer les workflows
    const dgiService = new DGIScraperService()
    const onboardingWorkflow = new OnboardingWorkflow(dgiService)
    this.workflowEngine.registerWorkflow(onboardingWorkflow)
    logger.info('Workflows registered')

    // 3. Setup WhatsApp
    this.setupWhatsAppAdapter()
    await this.whatsappAdapter.start()
    logger.info('WhatsApp adapter started')

    logger.info('Bot Engine initialized successfully')
  }

  private setupWhatsAppAdapter(): void {
    this.whatsappAdapter.setCallbacks({
      onMessageReceived: async (message: IncomingMessage) => {
        try {
          const response = await this.processMessage(message)
          await this.whatsappAdapter.sendMessage(response)
        } catch (error) {
          logger.error({ error: error.message }, 'Error processing message')
        }
      },
    })
  }

  public isConnected(): boolean {
    return this.whatsappAdapter.isConnected()
  }

  public async processMessage(message: IncomingMessage): Promise<OutgoingMessage> {
    const startTime = Date.now()

    try {
      const session = await this.sessionManager.getOrCreate(message)
      await this.saveIncomingMessage(message, session)

      const response = await this.generateResponse(message, session)
      await this.saveOutgoingMessage(response, session)

      const processingTime = Date.now() - startTime
      await this.markMessageAsProcessed(message, session, processingTime)

      logger.debug({ processingTime }, 'Message processed successfully')
      return response
    } catch (error) {
      const processingTime = Date.now() - startTime
      logger.error({ error: error.message, processingTime }, 'Error processing message')

      try {
        const session = await this.sessionManager.getOrCreate(message)
        await this.markMessageAsError(message, session, error as Error, processingTime)
      } catch {
        // Ignorer erreur de logging
      }

      return this.createErrorResponse(message)
    }
  }

  private async generateResponse(
    message: IncomingMessage,
    session: BotSessionExtended
  ): Promise<OutgoingMessage> {
    // 1. Vérifier commandes système
    const commandResult = await this.commandSystem.tryExecute(message, session)
    if (commandResult.handled) {
      // Pour les commandes qui changent l'affichage
      if (message.content.toLowerCase().trim() === 'menu') {
        const menuResponse = await this.handleMainMenu(message, session.botUser)
        return menuResponse
      }
      // Autres commandes (langue, aide, etc.) gérées par le CommandSystem
      return this.createOutgoingMessage(message, '', session.botUser.language)
    }

    // 2. Forcer onboarding si non vérifié
    if (!session.botUser.isVerified) {
      if (session.currentWorkflow !== 'onboarding') {
        await this.workflowEngine.startWorkflow('onboarding', session)
        const workflow = this.workflowEngine.getWorkflow('onboarding')!
        const stepMessage = await workflow.buildStepMessage(
          workflow.getStep(workflow.initialStep),
          session
        )
        return this.createOutgoingMessage(message, stepMessage, session.botUser.language)
      } else {
        await this.workflowEngine.processStep(session, message)
        return this.createOutgoingMessage(message, '', session.botUser.language)
      }
    }

    // 3. Traiter selon contexte
    if (session.currentWorkflow) {
      await this.workflowEngine.processStep(session, message)
      return this.createOutgoingMessage(message, '', session.botUser.language)
    } else if (session.currentStep === 'main_menu') {
      return await this.handleMenuChoice(message, session)
    } else {
      return await this.handleMainMenu(message, session.botUser)
    }
  }

  private async handleMainMenu(
    message: IncomingMessage,
    botUser: BotUser
  ): Promise<OutgoingMessage> {
    const availableWorkflows = Array.from(this.workflowEngine['workflows'].values())
      .filter((workflow) => workflow.id !== 'onboarding')
      .filter((workflow) => workflow.isAvailableFor({ botUser } as any))
      .sort((a, b) => a.menuOrder - b.menuOrder)

    const menuItems = availableWorkflows
      .map(
        (workflow, index) =>
          `${index + 1}. ${this.i18n.t(workflow.menuTitleKey, {}, botUser.language)}`
      )
      .join('\n')

    const content =
      this.i18n.t(
        'common.welcome_message',
        {
          name: botUser.fullName || botUser.phoneNumber,
        },
        botUser.language
      ) +
      '\n\n' +
      menuItems

    const responseText = this.messageBuilder.build({
      content,
      footer: this.i18n.t('common.navigation.select_option', {}, botUser.language),
      language: botUser.language,
    })

    return this.createOutgoingMessage(message, responseText, botUser.language)
  }

  private async handleMenuChoice(
    message: IncomingMessage,
    session: BotSessionExtended
  ): Promise<OutgoingMessage> {
    const choiceIndex = Number.parseInt(message.content) - 1
    const availableWorkflows = session.currentContext.availableWorkflows || []

    if (choiceIndex >= 0 && choiceIndex < availableWorkflows.length) {
      const workflowId = availableWorkflows[choiceIndex]
      await this.workflowEngine.startWorkflow(workflowId, session)
      return this.createOutgoingMessage(message, '', session.botUser.language)
    } else {
      const errorText = this.messageBuilder.build({
        content: this.i18n.t('errors.menu.invalid_choice', {}, session.botUser.language),
        footer: this.i18n.t('common.navigation.retry', {}, session.botUser.language),
        language: session.botUser.language,
      })
      return this.createOutgoingMessage(message, errorText, session.botUser.language)
    }
  }

  private async saveIncomingMessage(
    message: IncomingMessage,
    session: BotSessionExtended
  ): Promise<BotMessage> {
    return await BotMessage.create({
      sessionId: session.id,
      botUserId: session.botUserId,
      direction: 'in',
      messageType: message.messageType,
      content: message.content,
      structuredContent: {},
      language: session.botUser.language,
      rawData: message.rawData,
      workflowId: session.currentWorkflow,
      stepId: session.currentStep,
      contextSnapshot: session.currentContext,
      isProcessed: false,
    })
  }

  private async saveOutgoingMessage(
    message: OutgoingMessage,
    session: BotSessionExtended
  ): Promise<BotMessage> {
    return await BotMessage.create({
      sessionId: session.id,
      botUserId: session.botUserId,
      direction: 'out',
      messageType: message.messageType || 'text',
      content: message.content,
      structuredContent: message.structuredContent || {},
      language: session.botUser.language,
      rawData: {},
      workflowId: session.currentWorkflow,
      stepId: session.currentStep,
      contextSnapshot: session.currentContext,
      isProcessed: true,
    })
  }

  private async markMessageAsProcessed(
    message: IncomingMessage,
    session: BotSessionExtended,
    processingTimeMs: number
  ): Promise<void> {
    const botMessage = await BotMessage.query()
      .where('sessionId', session.id)
      .where('direction', 'in')
      .where('content', message.content)
      .orderBy('createdAt', 'desc')
      .first()

    if (botMessage) {
      await botMessage.markAsProcessed(processingTimeMs)
    }
  }

  private async markMessageAsError(
    message: IncomingMessage,
    session: BotSessionExtended,
    error: Error,
    processingTimeMs: number
  ): Promise<void> {
    const botMessage = await BotMessage.query()
      .where('sessionId', session.id)
      .where('direction', 'in')
      .where('content', message.content)
      .orderBy('createdAt', 'desc')
      .first()

    if (botMessage) {
      await botMessage.markAsError(error.message, processingTimeMs)
    }
  }

  private createOutgoingMessage(
    originalMessage: IncomingMessage,
    content: string,
    language: string
  ): OutgoingMessage {
    return {
      to: originalMessage.channelUserId,
      content,
      messageType: 'text',
    }
  }

  private createErrorResponse(message: IncomingMessage): OutgoingMessage {
    const errorText = this.messageBuilder.build({
      content: this.i18n.t('errors.system.processing_error', {}, 'fr'),
      footer: this.i18n.t('common.navigation.retry', {}, 'fr'),
      language: 'fr',
    })
    return this.createOutgoingMessage(message, errorText, 'fr')
  }

  public async shutdown(): Promise<void> {
    try {
      await this.whatsappAdapter.stop()
      logger.info('Bot shutdown completed')
    } catch (error) {
      logger.error({ error: error.message }, 'Error during shutdown')
    }
  }
}
