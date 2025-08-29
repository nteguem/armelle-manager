// app/bot/core/handlers/message_dispatcher.ts
import BotMessage from '#models/bot/bot_message'
import CommandManager from '#bot/core/managers/command_manager'
import SessionManager from '#bot/core/managers/session_manager'
import I18nManager from '#bot/core/managers/i18n_manager'
import MessageBuilder from '#bot/core/managers/message_builder'
import WorkflowManager from '#bot/core/workflow/workflow_manager'
import type {
  IncomingMessage,
  OutgoingMessage,
  SessionContext,
  ChannelAdapter,
} from '#bot/types/bot_types'

export default class MessageDispatcher {
  private commandManager: CommandManager
  private sessionManager: SessionManager
  private i18n: I18nManager
  private messageBuilder: MessageBuilder
  private workflowManager: WorkflowManager
  private adapters: Map<string, ChannelAdapter> = new Map()

  constructor() {
    this.commandManager = CommandManager.getInstance()
    this.sessionManager = SessionManager.getInstance()
    this.i18n = I18nManager.getInstance()
    this.messageBuilder = new MessageBuilder()
    this.workflowManager = WorkflowManager.getInstance()
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

      if (!sessionContext.isVerified) {
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
      const result = await this.workflowManager.startWorkflow(sessionContext, 'onboarding')
      await this.sessionManager.startWorkflow(sessionContext, 'onboarding', 'collect_name')
      await this.handleWorkflowResult(result, sessionContext)
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
      const result = await this.workflowManager.processStep(sessionContext, input)
      await this.handleWorkflowResult(result, sessionContext)
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

  private async handleWorkflowResult(result: any, sessionContext: SessionContext): Promise<void> {
    switch (result.action) {
      case 'send_message':
        await this.handleWorkflowSendMessage(result, sessionContext)
        break
      case 'call_service':
        await this.handleWorkflowServiceCall(result, sessionContext)
        break
      case 'complete_workflow':
        await this.handleWorkflowComplete(result, sessionContext)
        break
      case 'validation_error':
        await this.handleWorkflowValidationError(result, sessionContext)
        break
      case 'service_error':
        await this.handleWorkflowServiceError(result, sessionContext)
        break
    }
  }

  private async handleWorkflowSendMessage(
    result: any,
    sessionContext: SessionContext
  ): Promise<void> {
    if (result.nextStep) {
      await this.sessionManager.updateSessionContext(sessionContext, {
        currentStep: result.nextStep,
        workflowData: result.workflowData,
      })
    }

    if (result.shouldProcessNext && !result.messageKey && !result.menuOptions) {
      if (result.nextStep) {
        await this.processNextWorkflowStep(sessionContext)
      }
      return
    }

    let content: string
    if (result.messageKey) {
      content = this.i18n.t(result.messageKey, result.workflowData || {}, sessionContext.language)
    } else {
      content = result.content || 'Traitement en cours...'
    }

    if (result.menuOptions && result.menuOptions.length > 0) {
      const optionsText = result.menuOptions
        .map((opt: any) => {
          const label = opt.labelKey.startsWith('workflows.')
            ? this.i18n.t(opt.labelKey, {}, sessionContext.language)
            : opt.labelKey
          return `${opt.id}. ${label}`
        })
        .join('\n')
      content += '\n\n' + optionsText
    }

    const message = this.messageBuilder.build({
      content,
      subheader: this.getWorkflowSubheader(sessionContext),
      footer: this.getWorkflowFooter(sessionContext),
      language: sessionContext.language,
    })

    await this.sendMessage(sessionContext, message)

    if (result.shouldProcessNext && result.nextStep) {
      await this.processNextWorkflowStep(sessionContext)
    }
  }

  // app/bot/core/handlers/message_dispatcher.ts - CORRIGER handleWorkflowServiceCall

  private async handleWorkflowServiceCall(
    result: any,
    sessionContext: SessionContext
  ): Promise<void> {
    try {
      const { service, method, params } = result.serviceCall

      // DEBUG TEMPORAIRE
      console.log('🔍 DEBUG Service Call:', {
        service,
        method,
        params,
        sessionUserId: sessionContext.userId,
      })

      if (result.messageKey) {
        const progressMessage = this.messageBuilder.build({
          content: this.i18n.t(result.messageKey, params, sessionContext.language),
          subheader: this.getWorkflowSubheader(sessionContext),
          language: sessionContext.language,
        })
        await this.sendMessage(sessionContext, progressMessage)
      }

      const serviceResult = await this.callWorkflowService(service, method, params, sessionContext)
      const nextResult = await this.workflowManager.handleServiceResult(
        sessionContext,
        serviceResult
      )
      await this.handleWorkflowResult(nextResult, sessionContext)
    } catch (error) {
      console.error('❌ Workflow service call failed:', error)
      const errorResult = await this.workflowManager.handleServiceResult(
        sessionContext,
        null,
        (error as Error).message
      )
      await this.handleWorkflowResult(errorResult, sessionContext)
    }
  }

  private async handleWorkflowComplete(result: any, sessionContext: SessionContext): Promise<void> {
    if (sessionContext.currentWorkflow === 'onboarding') {
      await this.finalizeOnboarding(result, sessionContext)
    }

    if (result.messageKey) {
      const finalMessage = this.messageBuilder.build({
        content: this.i18n.t(result.messageKey, result.workflowData || {}, sessionContext.language),
        language: sessionContext.language,
      })
      await this.sendMessage(sessionContext, finalMessage)
    }

    await this.sessionManager.endWorkflow(sessionContext)
    await this.displayMainMenu(sessionContext)
  }

  private async finalizeOnboarding(result: any, sessionContext: SessionContext): Promise<void> {
    try {
      const botUserServiceModule = await import('#services/bot_user_service')
      const BotUserService = botUserServiceModule.default
      const botUserService = new BotUserService()

      if (result.workflowData?.user_name) {
        await botUserService.updateFullName(sessionContext.userId, result.workflowData.user_name)
      }

      if (result.workflowData?.selected_taxpayer) {
        await botUserService.markAsVerified(sessionContext.userId)
      }
    } catch (error) {
      console.error('❌ Failed to finalize onboarding:', error)
    }
  }

  private async handleWorkflowValidationError(
    result: any,
    sessionContext: SessionContext
  ): Promise<void> {
    const errorMessage = this.messageBuilder.build({
      content: result.validationError || 'Erreur de validation',
      subheader: this.getWorkflowSubheader(sessionContext),
      footer: this.i18n.t('common.navigation.retry', {}, sessionContext.language),
      language: sessionContext.language,
    })
    await this.sendMessage(sessionContext, errorMessage)
  }

  private async handleWorkflowServiceError(
    result: any,
    sessionContext: SessionContext
  ): Promise<void> {
    const errorMessage = this.messageBuilder.build({
      content: result.validationError || 'Erreur technique',
      subheader: this.getWorkflowSubheader(sessionContext),
      footer: this.i18n.t('common.navigation.menu_return', {}, sessionContext.language),
      language: sessionContext.language,
    })
    await this.sendMessage(sessionContext, errorMessage)
  }

  private async callWorkflowService(
    serviceName: string,
    methodName: string,
    params: any,
    sessionContext: SessionContext
  ): Promise<any> {
    switch (serviceName) {
      case 'dgi_scraper':
        const dgiServiceModule = await import('#services/dgi_scraper_service')
        const DgiService = dgiServiceModule.default
        const dgiInstance = new DgiService()

        if (methodName === 'rechercherParNom') {
          return await dgiInstance.rechercherParNom(params.nom)
        }
        throw new Error(`Unknown DGI method: ${methodName}`)

      case 'taxpayer_service':
        const taxpayerServiceModule = await import('#services/taxpayer_service')
        const TaxpayerService = taxpayerServiceModule.default
        const taxpayerInstance = new TaxpayerService()

        if (methodName === 'createAndLinkWithAsyncEnrichment') {
          // SOLUTION DÉFINITIVE : Récupérer directement depuis workflowData
          const realBotUserId = sessionContext.userId
          const realTaxpayerData = sessionContext.workflowData.selected_taxpayer

          console.log('✅ FINAL Service call:', {
            realBotUserId,
            realTaxpayerData,
            taxpayerName: realTaxpayerData?.nomRaisonSociale,
          })

          return await taxpayerInstance.createAndLinkWithAsyncEnrichment(
            realBotUserId,
            realTaxpayerData
          )
        }
        throw new Error(`Unknown TaxpayerService method: ${methodName}`)

      case 'bot_user_service':
        const botUserServiceModule = await import('#services/bot_user_service')
        const BotUserService = botUserServiceModule.default
        const botUserInstance = new BotUserService()

        if (methodName === 'markAsVerified') {
          return await botUserInstance.markAsVerified(sessionContext.userId)
        } else if (methodName === 'updateFullName') {
          return await botUserInstance.updateFullName(sessionContext.userId, params.fullName)
        }
        throw new Error(`Unknown BotUserService method: ${methodName}`)

      default:
        throw new Error(`Unknown service: ${serviceName}`)
    }
  }
  private async processNextWorkflowStep(sessionContext: SessionContext): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 500))

    try {
      const result = await this.workflowManager.processStep(sessionContext)
      await this.handleWorkflowResult(result, sessionContext)
    } catch (error) {
      console.error('❌ Error processing next workflow step:', error)
    }
  }

  // MODIFIER getWorkflowSubheader pour progression exacte

  private getWorkflowSubheader(sessionContext: SessionContext): string {
    if (!sessionContext.currentWorkflow || !sessionContext.currentStep) {
      return ''
    }

    if (sessionContext.currentWorkflow === 'onboarding') {
      switch (sessionContext.currentStep) {
        case 'collect_name':
          return this.i18n.t('common.subheaders.inscription_step1', {}, sessionContext.language)
        case 'search_dgi':
          return this.i18n.t('common.subheaders.inscription_step2', {}, sessionContext.language)
        case 'confirm_single':
        case 'select_multiple':
          return this.i18n.t('common.subheaders.inscription_step3', {}, sessionContext.language)
        default:
          return this.i18n.t(
            'common.subheaders.bienvenue',
            { name: sessionContext.workflowData.user_name },
            sessionContext.language
          )
      }
    }

    const workflow = this.workflowManager.getWorkflow(sessionContext.currentWorkflow)
    return workflow ? workflow.name : sessionContext.currentWorkflow
  }

  // MODIFIER getWorkflowFooter pour footers contextuels

  private getWorkflowFooter(sessionContext: SessionContext): string {
    if (!sessionContext.currentWorkflow || !sessionContext.currentStep) {
      return this.i18n.t('common.navigation.menu_return', {}, sessionContext.language)
    }

    if (sessionContext.currentWorkflow === 'onboarding') {
      switch (sessionContext.currentStep) {
        case 'collect_name':
          return this.i18n.t('common.navigation.onboarding_step1', {}, sessionContext.language)
        case 'search_dgi':
          return this.i18n.t('common.navigation.onboarding_step2', {}, sessionContext.language)
        case 'confirm_single':
        case 'select_multiple':
          return this.i18n.t('common.navigation.onboarding_step3', {}, sessionContext.language)
        default:
          return this.i18n.t('common.navigation.onboarding_final', {}, sessionContext.language)
      }
    }

    return this.i18n.t('common.navigation.menu_return', {}, sessionContext.language)
  }

  private async handleMenuNavigation(sessionContext: SessionContext, input: string): Promise<void> {
    const message = this.messageBuilder.build({
      content: this.i18n.t('errors.menu.invalid_choice', {}, sessionContext.language),
      footer: this.i18n.t('common.navigation.select_option', {}, sessionContext.language),
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
        const result = await this.workflowManager.processStep(sessionContext)
        await this.handleWorkflowResult(result, sessionContext)
      } catch (error) {
        console.error('❌ Error redisplaying workflow step:', error)
      }
    }
  }
}
