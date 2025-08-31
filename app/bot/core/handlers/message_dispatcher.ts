import BotMessage from '#models/bot/bot_message'
import CommandManager from '#bot/core/managers/command_manager'
import SessionManager from '#bot/core/managers/session_manager'
import I18nManager from '#bot/core/managers/i18n_manager'
import MessageBuilder from '#bot/core/managers/message_builder'
import { WorkflowEngine } from '#bot/core/workflow/engine/workflow_engine'
import { MessagePresenter } from '#bot/core/workflow/presentation/message_presenter'
import { WorkflowServiceRegistry } from '#bot/core/workflow/services/workflow_service_registry'
import { TransitionResolver } from '#bot/core/workflow/engine/transition_resolver'
import type {
  IncomingMessage,
  OutgoingMessage,
  SessionContext,
  ChannelAdapter,
} from '#bot/types/bot_types'
import type { WorkflowContext } from '#bot/core/workflow/engine/workflow_context'

export default class MessageDispatcher {
  private commandManager: CommandManager
  private sessionManager: SessionManager
  private i18n: I18nManager
  private messageBuilder: MessageBuilder
  private workflowEngine: WorkflowEngine
  private messagePresenter: MessagePresenter
  private serviceRegistry: WorkflowServiceRegistry
  private transitionResolver: TransitionResolver
  private adapters: Map<string, ChannelAdapter> = new Map()

  constructor() {
    this.commandManager = CommandManager.getInstance()
    this.sessionManager = SessionManager.getInstance()
    this.i18n = I18nManager.getInstance()
    this.messageBuilder = new MessageBuilder()
    this.workflowEngine = WorkflowEngine.getInstance()
    this.messagePresenter = MessagePresenter.getInstance()
    this.serviceRegistry = WorkflowServiceRegistry.getInstance()
    this.transitionResolver = new TransitionResolver()
  }

  public registerAdapter(channel: string, adapter: ChannelAdapter): void {
    this.adapters.set(channel, adapter)
  }

  public async handleIncomingMessage(incomingMessage: IncomingMessage): Promise<void> {
    const startTime = Date.now()
    let botMessage: BotMessage | null = null

    try {
      const sessionContext = await this.sessionManager.getOrCreateSession(
        incomingMessage.channel,
        incomingMessage.channelUserId
      )

      const botSession = await this.getBotSession(sessionContext)
      botMessage = await BotMessage.createIncoming({
        session: botSession,
        content: incomingMessage.content,
        messageType: incomingMessage.messageType,
        rawData: incomingMessage.rawData,
      })

      const commandResult = this.commandManager.detectCommand(
        incomingMessage.content,
        sessionContext
      )

      if (commandResult.detected) {
        await this.handleSystemCommand(commandResult, sessionContext, botMessage)
        return
      }

      if (sessionContext.currentWorkflow) {
        await this.handleWorkflowMessage(sessionContext, incomingMessage.content)
        return
      }

      const botUser = await this.getBotUser(sessionContext.userId)
      if (!botUser?.fullName) {
        await this.handleOnboardingRequired(sessionContext)
        return
      }

      await this.handleMenuNavigation(sessionContext, incomingMessage.content)
    } catch (error) {
      console.error('❌ Error processing message:', error)
      await this.handleError(incomingMessage, error as Error, botMessage)
    } finally {
      if (botMessage) {
        const duration = Date.now() - startTime
        await botMessage.markAsProcessed(duration)
      }
    }
  }

  private async handleSystemCommand(
    commandResult: any,
    sessionContext: SessionContext,
    botMessage: BotMessage
  ): Promise<void> {
    await botMessage.recordSystemCommand(commandResult.type, !commandResult.blocked)

    if (commandResult.blocked) {
      const errorMessage = this.messageBuilder.build({
        content:
          commandResult.reason ||
          this.i18n.t('errors.commands.not_allowed_in_context', {}, sessionContext.language),
        language: sessionContext.language,
      })
      await this.sendMessage(sessionContext, errorMessage)
      return
    }

    switch (commandResult.command) {
      case 'language':
        await this.handleLanguageCommand(commandResult.type, sessionContext)
        break
      case 'navigation':
        await this.handleNavigationCommand(commandResult.type, sessionContext)
        break
    }
  }

  private async handleLanguageCommand(
    commandType: string,
    sessionContext: SessionContext
  ): Promise<void> {
    const newLanguage = this.commandManager.getLanguageTarget(commandType)
    if (!newLanguage) return

    await this.sessionManager.updateUserLanguage(sessionContext, newLanguage)

    if (sessionContext.currentWorkflow) {
      await this.redisplayCurrentWorkflowStep(sessionContext)
    } else {
      await this.displayMainMenu(sessionContext)
    }
  }

  private async handleNavigationCommand(
    commandType: string,
    sessionContext: SessionContext
  ): Promise<void> {
    switch (commandType) {
      case 'help':
        await this.displayContextualHelp(sessionContext)
        break
      case 'menu':
        await this.sessionManager.endWorkflow(sessionContext)
        await this.displayMainMenu(sessionContext)
        break
    }
  }

  private async handleOnboardingRequired(sessionContext: SessionContext): Promise<void> {
    try {
      const result = await this.workflowEngine.startWorkflow(sessionContext, 'onboarding')
      await this.sessionManager.startWorkflow(sessionContext, 'onboarding', 'collect_name')
      await this.processWorkflowResult(result, sessionContext)
    } catch (error) {
      console.error('❌ Error starting onboarding workflow:', error)
      const message = this.messageBuilder.build({
        content: this.i18n.t('errors.workflow.start_failed', {}, sessionContext.language),
        language: sessionContext.language,
      })
      await this.sendMessage(sessionContext, message)
    }
  }

  private async handleWorkflowMessage(
    sessionContext: SessionContext,
    input: string
  ): Promise<void> {
    try {
      const workflowContext = this.createWorkflowContext(sessionContext)

      if (workflowContext.variables.pending_selection) {
        await this.handlePendingTaxpayerSelection(workflowContext, input)
        return
      }

      if (workflowContext.currentStep === 'collect_name' && input.trim()) {
        const botUserServiceModule = await import('#services/bot_user_service')
        const BotUserService = botUserServiceModule.default
        const botUserService = new BotUserService()
        await botUserService.updateFullName(sessionContext.userId, input.trim())
      }

      const result = await this.workflowEngine.processStep(workflowContext, input)
      await this.processWorkflowResult(result, workflowContext)
    } catch (error) {
      console.error('❌ Error processing workflow message:', error)
      const message = this.messageBuilder.build({
        content: this.i18n.t('errors.workflow.processing_failed', {}, sessionContext.language),
        footer: this.i18n.t('common.navigation.menu_return', {}, sessionContext.language),
        language: sessionContext.language,
      })
      await this.sendMessage(sessionContext, message)
    }
  }

  private async processWorkflowResult(
    result: any,
    context: SessionContext | WorkflowContext
  ): Promise<void> {
    const sessionContext = 'session' in context ? context.session : context
    const workflowContext =
      'session' in context ? context : this.createWorkflowContext(sessionContext)

    if (result.saveData) {
      Object.assign(workflowContext.variables, result.saveData)
      workflowContext.session.workflowData = workflowContext.variables
    }

    switch (result.action) {
      case 'send_message':
        await this.handleSendMessage(result, workflowContext)
        break
      case 'call_service':
        await this.handleServiceCall(result, workflowContext)
        break
      case 'complete_workflow':
        await this.handleCompleteWorkflow(result, workflowContext)
        break
      case 'validation_error':
        await this.handleValidationError(result, workflowContext)
        break
      case 'transition':
        await this.handleTransition(result, workflowContext)
        break
    }
  }

  private async handleSendMessage(result: any, context: WorkflowContext): Promise<void> {
    if (result.nextStep) {
      await this.sessionManager.updateSessionContext(context.session, {
        currentStep: result.nextStep,
        workflowData: context.variables,
      })
      context.currentStep = result.nextStep
    }

    const formattedMessage = this.messagePresenter.format(result, context)
    await this.sendMessage(context.session, formattedMessage)

    if (result.shouldProcessNext && result.nextStep) {
      await this.processNextWorkflowStep(context)
    }
  }

  private async handleServiceCall(result: any, context: WorkflowContext): Promise<void> {
    try {
      const { service, method, params } = result.serviceCall

      if (result.messageKey) {
        const progressMessage = this.messagePresenter.format(result, context)
        await this.sendMessage(context.session, progressMessage)
      }

      const serviceParams = Object.values(params || {})
      const serviceResult = await this.serviceRegistry.call(service, method, serviceParams)

      const saveKey = result.saveAs || 'service_result'
      context.variables[saveKey] = serviceResult
      context.session.workflowData = context.variables

      if (service === 'onboarding_service') {
        await this.handleOnboardingServiceResult(serviceResult, context)
        return
      }

      const workflow = this.workflowEngine.getWorkflow(context.workflowId)
      if (!workflow) throw new Error(`Workflow not found: ${context.workflowId}`)

      const stepDef = workflow.steps[context.currentStep]
      if (!stepDef || !stepDef.nextStep) {
        await this.handleCompleteWorkflow(result, context)
        return
      }

      const nextStep = this.transitionResolver.resolve(stepDef.nextStep, context.variables)
      if (nextStep) {
        context.currentStep = nextStep
        context.session.currentStep = nextStep
        const nextResult = await this.workflowEngine.processStep(context)
        await this.processWorkflowResult(nextResult, context)
      } else {
        await this.handleCompleteWorkflow(result, context)
      }
    } catch (error) {
      console.error('❌ Service call failed:', error)
      const errorMessage = this.messagePresenter.formatError(
        "Erreur lors de l'appel du service",
        context
      )
      await this.sendMessage(context.session, errorMessage)
    }
  }

  private async handleOnboardingServiceResult(
    serviceResult: any,
    context: WorkflowContext
  ): Promise<void> {
    switch (serviceResult.messageType) {
      case 'completion':
        await this.finalizeOnboardingCleanup(context, serviceResult)
        break
      case 'selection':
        await this.handleTaxpayerSelection(context, serviceResult)
        break
      case 'retry':
        await this.handleRetryNameInput(context, serviceResult)
        break
      case 'error':
        await this.finalizeOnboardingCleanup(context, serviceResult)
        break
      default:
        await this.finalizeOnboardingCleanup(context, serviceResult)
    }
  }

  private async handleTaxpayerSelection(
    context: WorkflowContext,
    serviceResult: any
  ): Promise<void> {
    const { taxpayers } = serviceResult.data

    const options = taxpayers
      .map(
        (tp: any, index: number) =>
          `${index + 1}. ${tp.nomRaisonSociale} ${tp.prenomSigle} - ${tp.centre}`
      )
      .join('\n')

    const selectionMessage = this.messageBuilder.build({
      content:
        this.i18n.t(serviceResult.messageKey, {}, context.session.language) +
        '\n\n' +
        options +
        '\n0. Aucun de ces profils',
      language: context.session.language,
    })

    await this.sendMessage(context.session, selectionMessage)

    context.variables.pending_selection = serviceResult.data
    context.session.workflowData = context.variables
  }

  private async handleRetryNameInput(context: WorkflowContext, serviceResult: any): Promise<void> {
    const retryMessage = this.messageBuilder.build({
      content: this.i18n.t(
        serviceResult.messageKey,
        serviceResult.messageParams || {},
        context.session.language
      ),
      language: context.session.language,
    })

    await this.sendMessage(context.session, retryMessage)

    context.currentStep = 'collect_name'
    context.session.currentStep = 'collect_name'
    await this.sessionManager.updateSessionContext(context.session, {
      currentStep: 'collect_name',
      workflowData: {},
    })

    const nextResult = await this.workflowEngine.processStep(context)
    await this.processWorkflowResult(nextResult, context)
  }

  private async finalizeOnboardingCleanup(
    context: WorkflowContext,
    serviceResult: any
  ): Promise<void> {
    const finalMessage = this.messageBuilder.build({
      subheader: this.i18n.t(
        'workflows.onboarding.completion_subheader',
        serviceResult.messageParams || {},
        context.session.language
      ),
      content: this.i18n.t('workflows.onboarding.completion_content', {}, context.session.language),
      footer: this.i18n.t('workflows.onboarding.completion_footer', {}, context.session.language),
      language: context.session.language,
    })

    await this.sendMessage(context.session, finalMessage)

    await this.sessionManager.endWorkflow(context.session)
    await this.workflowEngine.completeWorkflow(context)
  }

  private async handlePendingTaxpayerSelection(
    context: WorkflowContext,
    input: string
  ): Promise<void> {
    const selectedIndex = Number.parseInt(input.trim())
    const pendingData = context.variables.pending_selection

    if (Number.isNaN(selectedIndex)) {
      const errorMessage = this.messageBuilder.build({
        content: this.i18n.t(
          'workflows.onboarding.invalid_selection',
          {},
          context.session.language
        ),
        language: context.session.language,
      })
      await this.sendMessage(context.session, errorMessage)
      return
    }

    const onboardingServiceModule = await import('#services/onboarding_service')
    const OnboardingService = onboardingServiceModule.default
    const onboardingService = new OnboardingService()

    const linkResult = await onboardingService.linkSelectedTaxpayer(
      pendingData.botUserId,
      pendingData.userName,
      selectedIndex,
      pendingData.taxpayers
    )

    if (!linkResult.success) {
      const errorMessage = this.messageBuilder.build({
        content: this.i18n.t(
          linkResult.messageKey,
          linkResult.messageParams || {},
          context.session.language
        ),
        language: context.session.language,
      })
      await this.sendMessage(context.session, errorMessage)
      return
    }

    await this.finalizeOnboardingCleanup(context, linkResult)
  }

  private async handleCompleteWorkflow(result: any, context: WorkflowContext): Promise<void> {
    if (result.messageKey) {
      const finalMessage = this.messagePresenter.formatCompletion(context, context.variables)
      await this.sendMessage(context.session, finalMessage)
    }

    await this.sessionManager.endWorkflow(context.session)
    await this.workflowEngine.completeWorkflow(context)
  }

  private async handleValidationError(result: any, context: WorkflowContext): Promise<void> {
    const errorMessage = this.messagePresenter.formatError(
      result.error || 'Erreur de validation',
      context
    )
    await this.sendMessage(context.session, errorMessage)
  }

  private async handleTransition(result: any, context: WorkflowContext): Promise<void> {
    if (result.nextStep) {
      context.currentStep = result.nextStep
      context.session.currentStep = result.nextStep

      if (result.shouldProcessNext) {
        await this.processNextWorkflowStep(context)
      }
    }
  }

  private createWorkflowContext(sessionContext: SessionContext): WorkflowContext {
    return {
      workflowId: sessionContext.currentWorkflow!,
      currentStep: sessionContext.currentStep!,
      session: sessionContext,
      variables: sessionContext.workflowData || {},
      execution: {
        startedAt: new Date(),
        stepStartedAt: new Date(),
        retryCount: 0,
      },
    }
  }

  private async processNextWorkflowStep(context: WorkflowContext): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 500))

    try {
      const result = await this.workflowEngine.processStep(context)
      await this.processWorkflowResult(result, context)
    } catch (error) {
      console.error('❌ Error processing next workflow step:', error)
    }
  }

  private async handleMenuNavigation(sessionContext: SessionContext, input: string): Promise<void> {
    const message = this.messageBuilder.build({
      subheader: this.i18n.t('common.main_menu.ai_ready', {}, sessionContext.language),
      content: this.i18n.t('common.main_menu.ai_response', {}, sessionContext.language),
      footer: this.i18n.t('common.main_menu.footer', {}, sessionContext.language),
      language: sessionContext.language,
    })
    await this.sendMessage(sessionContext, message)
  }

  private async displayMainMenu(sessionContext: SessionContext): Promise<void> {
    const message = this.messageBuilder.build({
      content: this.i18n.t('common.main_menu.welcome_back', {}, sessionContext.language),
      subheader: this.i18n.t('common.main_menu.subtitle', {}, sessionContext.language),
      footer: this.i18n.t('common.main_menu.footer', {}, sessionContext.language),
      language: sessionContext.language,
    })
    await this.sendMessage(sessionContext, message)
  }

  private async displayContextualHelp(sessionContext: SessionContext): Promise<void> {
    const helpMessage = this.messageBuilder.build({
      content: this.i18n.t('common.help_message', {}, sessionContext.language),
      language: sessionContext.language,
    })
    await this.sendMessage(sessionContext, helpMessage)
  }

  private async sendMessage(sessionContext: SessionContext, content: string): Promise<void> {
    const adapter = this.adapters.get(sessionContext.channel)
    if (!adapter) {
      throw new Error(`No adapter found for channel: ${sessionContext.channel}`)
    }

    const outgoingMessage: OutgoingMessage = {
      channel: sessionContext.channel,
      to: sessionContext.channelUserId,
      content,
      messageType: 'text',
    }

    await adapter.sendMessage(outgoingMessage)

    const botSession = await this.getBotSession(sessionContext)
    await BotMessage.createOutgoing({
      session: botSession,
      content,
      messageType: 'text',
    })
  }

  private async getBotSession(sessionContext: SessionContext): Promise<any> {
    const botSessionModule = await import('#models/bot/bot_session')
    const BotSession = botSessionModule.default
    return await BotSession.findActiveSession(sessionContext.channel, sessionContext.channelUserId)
  }

  private async getBotUser(userId: string): Promise<any> {
    const botUserModule = await import('#models/bot/bot_user')
    const BotUser = botUserModule.default
    return await BotUser.find(userId)
  }

  private async handleError(
    incomingMessage: IncomingMessage,
    error: Error,
    botMessage: BotMessage | null
  ): Promise<void> {
    console.error('❌ MessageDispatcher Error:', error.message)
    if (botMessage) {
      await botMessage.markAsError(error.message)
    }
  }

  private async redisplayCurrentWorkflowStep(sessionContext: SessionContext): Promise<void> {
    if (sessionContext.currentWorkflow) {
      try {
        const workflowContext = this.createWorkflowContext(sessionContext)
        const result = await this.workflowEngine.processStep(workflowContext)
        await this.processWorkflowResult(result, workflowContext)
      } catch (error) {
        console.error('❌ Error redisplaying workflow step:', error)
      }
    }
  }
}
