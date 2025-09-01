import type { SessionContext } from '#bot/types/bot_types'
import { WorkflowEngine } from '#bot/core/workflow/engine/workflow_engine'
import SessionManager from '#bot/core/managers/session_manager'
import I18nManager from '#bot/core/managers/i18n_manager'
import { MessagePresenter } from '#bot/core/workflow/presentation/message_presenter'
import StepResultHandler from '#bot/core/workflow/handlers/step_result_handler'
import MessageBuilder from '../managers/message_builder.js'

export default class WorkflowOrchestrator {
  private workflowEngine: WorkflowEngine
  private sessionManager: SessionManager
  private i18n: I18nManager
  private messagePresenter: MessagePresenter
  private stepResultHandler: StepResultHandler
  private messageBuilder: MessageBuilder

  constructor() {
    this.workflowEngine = WorkflowEngine.getInstance()
    this.sessionManager = SessionManager.getInstance()
    this.i18n = I18nManager.getInstance()
    this.messagePresenter = MessagePresenter.getInstance()
    this.messageBuilder = new MessageBuilder()
    this.stepResultHandler = new StepResultHandler()
  }

  public async startOnboarding(sessionContext: SessionContext): Promise<void> {
    await this.startWorkflow(sessionContext, 'onboarding')
  }

  public async startWorkflow(sessionContext: SessionContext, workflowId: string): Promise<void> {
    try {
      const result = await this.workflowEngine.startWorkflow(sessionContext, workflowId)

      const workflow = this.workflowEngine.getWorkflow(workflowId)
      const firstStep = workflow?.startStep || 'start'

      await this.sessionManager.startWorkflow(sessionContext, workflowId, firstStep)
      await this.stepResultHandler.handle(result, sessionContext)
    } catch (error) {
      console.error(`Error starting workflow ${workflowId}:`, error)

      const errorContext = this.createWorkflowContext(sessionContext)
      const errorMessage = this.messagePresenter.formatError(
        this.i18n.t('errors.workflow.start_failed', {}, sessionContext.language),
        errorContext
      )
      await this.sendMessage(sessionContext, errorMessage)
    }
  }

  public async handleWorkflowMessage(sessionContext: SessionContext, input: string): Promise<void> {
    try {
      const workflowContext = this.createWorkflowContext(sessionContext)

      if (workflowContext.variables.pending_selection) {
        await this.handlePendingSelection(workflowContext, input)
        return
      }

      const result = await this.workflowEngine.processStep(workflowContext, input)
      await this.stepResultHandler.handle(result, workflowContext)
    } catch (error) {
      console.error('Error processing workflow message:', error)

      const workflowContext = this.createWorkflowContext(sessionContext)
      const errorMessage = this.messagePresenter.formatError(
        this.i18n.t('errors.workflow.processing_failed', {}, sessionContext.language),
        workflowContext
      )
      await this.sendMessage(sessionContext, errorMessage)
    }
  }

  private async handlePendingSelection(workflowContext: any, input: string): Promise<void> {
    const selectedIndex = Number.parseInt(input.trim())
    const pendingData = workflowContext.variables.pending_selection

    if (Number.isNaN(selectedIndex)) {
      const errorMessage = this.messagePresenter.formatError(
        this.i18n.t('common.selection.invalid_number', {}, workflowContext.session.language),
        workflowContext
      )
      await this.sendMessage(workflowContext.session, errorMessage)
      return
    }

    const selectionServiceName =
      pendingData.serviceName || this.inferServiceFromContext(workflowContext)
    const selectionMethodName = pendingData.selectionMethod || 'handleSelection'

    try {
      const serviceRegistry = await import('#bot/core/workflow/services/workflow_service_registry')
      const registry = serviceRegistry.WorkflowServiceRegistry.getInstance()

      const selectionResult = await registry.call(selectionServiceName, selectionMethodName, [
        pendingData.botUserId || workflowContext.session.userId,
        pendingData.userName || pendingData.originalInput,
        selectedIndex,
        pendingData.taxpayers || pendingData.items || [],
      ])

      delete workflowContext.variables.pending_selection
      workflowContext.session.workflowData = workflowContext.variables

      if (selectionResult.success === false) {
        const errorMessage = this.messagePresenter.formatError(
          this.i18n.t(
            selectionResult.messageKey || 'common.selection.error',
            selectionResult.messageParams || {},
            workflowContext.session.language
          ),
          workflowContext
        )
        await this.sendMessage(workflowContext.session, errorMessage)
        return
      }

      await this.finalizeSelection(workflowContext, selectionResult)
    } catch (error) {
      console.error('Error handling selection:', error)

      delete workflowContext.variables.pending_selection
      workflowContext.session.workflowData = workflowContext.variables

      const errorMessage = this.messagePresenter.formatError(
        this.i18n.t('common.selection.processing_error', {}, workflowContext.session.language),
        workflowContext
      )
      await this.sendMessage(workflowContext.session, errorMessage)
    }
  }

  private inferServiceFromContext(workflowContext: any): string {
    const currentWorkflow = workflowContext.workflowId
    const serviceMap: Record<string, string> = {
      onboarding: 'onboarding_service',
      calcul_igs: 'igs_service',
      teledeclaration: 'declaration_service',
    }
    return serviceMap[currentWorkflow] || `${currentWorkflow}_service`
  }

  private async finalizeSelection(context: any, selectionResult: any): Promise<void> {
    const finalResult = {
      action: 'send_message' as const,
      content: this.i18n.t(
        selectionResult.messageKey || 'common.completion.content',
        selectionResult.messageParams || {},
        context.session.language
      ),
    }

    const finalMessage = this.messagePresenter.format(finalResult, context)
    await this.sendMessage(context.session, finalMessage)

    // Terminer workflow
    await this.sessionManager.endWorkflow(context.session)
    await this.workflowEngine.completeWorkflow(context)

    // Afficher menu principal IA
    await this.displayMainMenu(context.session)
  }

  private async displayMainMenu(sessionContext: SessionContext): Promise<void> {
    // Récupérer BotUser pour déterminer l'état du profil
    const botUser = await this.getBotUser(sessionContext.userId)
    const userName = botUser?.fullName || 'Utilisateur'

    // Vérifier si l'utilisateur est lié à un contribuable
    const isLinkedToTaxpayer = await this.checkTaxpayerLink(sessionContext.userId)

    let subheaderKey: string
    let contentKey: string
    let footerKey = 'common.main_menu.footer'
    let messageParams: Record<string, any> = { userName }

    if (isLinkedToTaxpayer.linked) {
      // Cas 1: Profil configuré avec NIU
      subheaderKey = 'common.main_menu.profile_complete_subheader'
      contentKey = 'common.main_menu.welcome_with_name'
      messageParams.niu = isLinkedToTaxpayer.niu
    } else {
      // Cas 2: Profil partiel (nom seulement)
      subheaderKey = 'common.main_menu.profile_partial_subheader'
      contentKey = 'common.main_menu.welcome_partial_profile'
    }

    // Créer contexte vide pour menu principal
    const emptyContext = {
      workflowId: '',
      currentStep: '',
      session: sessionContext,
      variables: {},
      execution: {
        startedAt: new Date(),
        stepStartedAt: new Date(),
        retryCount: 0,
      },
    }

    const menuResult = {
      action: 'send_message' as const,
      messageKey: contentKey,
      content: this.i18n.t(contentKey, messageParams, sessionContext.language),
    }

    // Formater avec subheader et footer personnalisés
    const menuMessage = this.messagePresenter.format(menuResult, emptyContext)

    // Remplacer le subheader généré par notre subheader personnalisé
    const customSubheader = this.i18n.t(subheaderKey, messageParams, sessionContext.language)
    const customFooter = this.i18n.t(footerKey, {}, sessionContext.language)

    const finalMessage = this.messageBuilder.build({
      content: this.i18n.t(contentKey, messageParams, sessionContext.language),
      subheader: customSubheader,
      footer: customFooter,
      language: sessionContext.language,
    })

    await this.sendMessage(sessionContext, finalMessage)
  }

  private async getBotUser(userId: string): Promise<any> {
    const botUserModule = await import('#models/bot/bot_user')
    return await botUserModule.default.find(userId)
  }

  private async checkTaxpayerLink(userId: string): Promise<{ linked: boolean; niu?: string }> {
    try {
      // Vérifier si BotUser est lié à un contribuable
      const botUserTaxpayerModule = await import('#models/bot/bot_user_taxpayers')
      const BotUserTaxpayers = botUserTaxpayerModule.default

      const link = await BotUserTaxpayers.query()
        .where('botUserId', userId)
        .preload('taxpayer')
        .first()

      if (link && link.taxpayer) {
        return {
          linked: true,
          niu: link.taxpayer.niu || undefined,
        }
      }

      return { linked: false }
    } catch (error) {
      console.error('Error checking taxpayer link:', error)
      return { linked: false }
    }
  }

  private createWorkflowContext(sessionContext: SessionContext): any {
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

  private async sendMessage(sessionContext: SessionContext, content: string): Promise<void> {
    console.log('Send message - to be provided by MessageRouter')
  }
}
