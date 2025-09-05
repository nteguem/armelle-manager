import WorkflowExecutor from './workflow_executor.js'
import { WorkflowRegistry } from '../registry/workflow_registry.js'
import { WorkflowServiceRegistry } from '../services/workflow_service_registry.js'
import type { WorkflowContext, WorkflowStep } from '../../../types/workflow_types.js'
import type { SessionContext } from '#bot/types/bot_types'
import I18nManager from '#bot/core/managers/i18n_manager'
import MessageBuilder from '#bot/core/managers/message_builder'
import SessionManager from '#bot/core/managers/session_manager'
import BotUser from '#models/bot/bot_user'

export default class WorkflowEngine {
  private static instance: WorkflowEngine
  private executors: Map<string, WorkflowExecutor> = new Map()
  private i18n: I18nManager
  private messageBuilder: MessageBuilder
  private pendingMessages: Map<string, string> = new Map() // Pour stocker les messages en attente

  private constructor() {
    this.i18n = I18nManager.getInstance()
    this.messageBuilder = new MessageBuilder()
  }

  public static getInstance(): WorkflowEngine {
    if (!WorkflowEngine.instance) {
      WorkflowEngine.instance = new WorkflowEngine()
    }
    return WorkflowEngine.instance
  }

  public startWorkflow(
    workflowId: string,
    sessionContext: SessionContext
  ): {
    success: boolean
    message?: string
    error?: string
  } {
    const workflowRegistry = WorkflowRegistry.getInstance()
    const workflow = workflowRegistry.createInstance(workflowId)

    if (!workflow) {
      return {
        success: false,
        error: `Workflow ${workflowId} not found or disabled`,
      }
    }

    const context: WorkflowContext = {
      workflowId,
      currentStepIndex: 0,
      data: {},
      history: [],
      language: sessionContext.language,
    }

    const executor = new WorkflowExecutor(workflow, context, sessionContext)

    const serviceRegistry = WorkflowServiceRegistry.getInstance()
    const services = serviceRegistry.getAll()
    for (const [name, service] of services) {
      executor.registerService(name, service)
    }

    const executorKey = this.getExecutorKey(sessionContext)
    this.executors.set(executorKey, executor)

    const firstStep = executor.getCurrentStep()
    if (!firstStep) {
      return { success: false, error: 'No first step found' }
    }

    context.history.push(firstStep.id)
    const message = this.buildStepMessage(firstStep, context, workflow.getDefinition().steps.length)

    return { success: true, message }
  }

  public async processInput(
    input: string,
    sessionContext: SessionContext
  ): Promise<{
    success: boolean
    message?: string
    complete?: boolean
    error?: string
    data?: any
  }> {
    const executorKey = this.getExecutorKey(sessionContext)
    const executor = this.executors.get(executorKey)

    if (!executor) {
      return {
        success: false,
        error: 'No active workflow found',
      }
    }

    const context = executor.getContext()
    const workflow = WorkflowRegistry.getInstance().createInstance(context.workflowId)!

    // Commande retour arrière
    if (input.toLowerCase() === 'retour' || input.toLowerCase() === 'back') {
      const result = executor.goBack()
      if (!result.success) {
        return {
          success: false,
          message: this.i18n.t('workflows.common.cannot_go_back', {}, sessionContext.language),
        }
      }
      const message = this.buildStepMessage(
        result.step!,
        context,
        workflow.getDefinition().steps.length
      )
      return { success: true, message }
    }

    // Traiter l'input normalement
    const result = await executor.processInput(input)

    // Si erreur de validation
    if (!result.success) {
      const currentStep = executor.getCurrentStep()
      const errorMessage = this.i18n.t(
        'workflows.common.validation_error',
        {
          error: result.error,
        },
        sessionContext.language
      )
      const stepMessage = this.buildStepMessage(
        currentStep!,
        context,
        workflow.getDefinition().steps.length
      )
      return {
        success: false,
        message: `${errorMessage}\n\n${stepMessage}`,
      }
    }

    // Si workflow terminé
    if (result.complete) {
      this.executors.delete(executorKey)

      // Pour l'onboarding, gérer le message final
      if (context.workflowId === 'onboarding') {
        const data = result.data || {}

        // Mettre à jour isVerified si profil complet
        if (data.profileType === 'complete' && sessionContext.userId) {
          const user = await BotUser.find(sessionContext.userId)
          if (user) {
            user.isVerified = true
            await user.save()
          }

          // Mettre aussi à jour le contexte de session
          const sessionManager = SessionManager.getInstance()
          await sessionManager.updateSessionContext(sessionContext, {
            isVerified: true,
          })
        }

        // Message final selon le profil
        let finalMessage: string
        if (data.profileType === 'partial') {
          finalMessage = this.messageBuilder.build({
            content: this.i18n.t(
              'workflows.onboarding.completion_partial',
              { userName: data.userName || 'Utilisateur' },
              sessionContext.language
            ),
            footer: this.i18n.t('common.footer_options', {}, sessionContext.language),
            language: sessionContext.language,
          })
        } else if (data.profileType === 'complete') {
          finalMessage = this.messageBuilder.build({
            content: this.i18n.t(
              'workflows.onboarding.completion_complete',
              {
                userName: data.userName || 'Utilisateur',
                niu: data.niu || '',
              },
              sessionContext.language
            ),
            footer: this.i18n.t('common.footer_options', {}, sessionContext.language),
            language: sessionContext.language,
          })
        } else {
          finalMessage = this.messageBuilder.build({
            content: this.i18n.t(
              'workflows.onboarding.completion_error',
              { userName: data.userName || 'Utilisateur' },
              sessionContext.language
            ),
            footer: this.i18n.t('common.footer_options', {}, sessionContext.language),
            language: sessionContext.language,
          })
        }

        return {
          success: true,
          complete: true,
          message: finalMessage,
          data: data,
        }
      }

      // Autres workflows
      return {
        success: true,
        complete: true,
        data: result.data,
        message: this.i18n.t('workflows.common.completed', {}, sessionContext.language),
      }
    }

    // Si prochaine étape existe
    if (result.nextStep) {
      // Message de transition spécial pour l'onboarding
      if (result.nextStep.id === 'searching_transition') {
        const transitionMessage = this.buildStepMessage(
          result.nextStep,
          context,
          workflow.getDefinition().steps.length
        )

        // Stocker le message pour l'envoyer plus tard
        this.pendingMessages.set(executorKey, transitionMessage)

        // Continuer immédiatement l'exécution pour faire la recherche
        setTimeout(async () => {
          const searchResult = await executor.processInput('')

          // Récupérer et supprimer le message en attente
          const pendingMsg = this.pendingMessages.get(executorKey)
          this.pendingMessages.delete(executorKey)

          if (searchResult.nextStep) {
            const nextMessage = this.buildStepMessage(
              searchResult.nextStep,
              executor.getContext(),
              workflow.getDefinition().steps.length
            )
            // Ici on devrait pouvoir envoyer le prochain message via un callback
            // Pour le moment on va juste le stocker
            this.pendingMessages.set(executorKey + '_next', nextMessage)
          }
        }, 100)

        // Retourner seulement le message de transition
        return { success: true, message: transitionMessage }
      }

      // Vérifier s'il y a un message suivant en attente
      const nextMessageKey = executorKey + '_next'
      if (this.pendingMessages.has(nextMessageKey)) {
        const nextMessage = this.pendingMessages.get(nextMessageKey)!
        this.pendingMessages.delete(nextMessageKey)
        return { success: true, message: nextMessage }
      }

      // Étapes normales
      const message = this.buildStepMessage(
        result.nextStep,
        context,
        workflow.getDefinition().steps.length
      )

      // Si c'est une étape de type message, continuer automatiquement
      if (result.nextStep.type === 'message' && result.nextStep.id !== 'searching_transition') {
        const autoResult = await executor.processInput('')
        if (autoResult.nextStep) {
          const autoMessage = this.buildStepMessage(
            autoResult.nextStep,
            context,
            workflow.getDefinition().steps.length
          )
          return { success: true, message: autoMessage }
        }
        if (autoResult.complete) {
          return await this.processInput('', sessionContext)
        }
      }

      return { success: true, message, data: result.data }
    }

    return { success: false, error: 'Unexpected workflow state' }
  }

  public cancelWorkflow(sessionContext: SessionContext): boolean {
    const executorKey = this.getExecutorKey(sessionContext)
    this.pendingMessages.delete(executorKey)
    this.pendingMessages.delete(executorKey + '_next')
    return this.executors.delete(executorKey)
  }

  public hasActiveWorkflow(sessionContext: SessionContext): boolean {
    const executorKey = this.getExecutorKey(sessionContext)
    return this.executors.has(executorKey)
  }

  private buildStepMessage(
    step: WorkflowStep,
    context: WorkflowContext,
    totalSteps: number
  ): string {
    let content = step.prompt
    if (step.prompt && step.prompt.includes('.')) {
      content = this.i18n.t(step.prompt, context.data, context.language)
    }

    if (step.type === 'choice' && step.choices) {
      const choices = step.choices
        .map((choice, index) => {
          const label = choice.label.includes('.')
            ? this.i18n.t(choice.label as string, {}, context.language)
            : choice.label
          return `${index + 1}. ${label}`
        })
        .join('\n')

      content = `${content}\n\n${choices}`
    }

    const visibleSteps = this.countVisibleSteps(context.workflowId)
    const currentVisibleStep = this.getCurrentVisibleStepNumber(
      context.workflowId,
      context.currentStepIndex
    )

    const workflowName = this.i18n.t(`workflows.${context.workflowId}.name`, {}, context.language)

    const subheader = `${workflowName} - ${this.i18n.t(
      'common.step_progress',
      {
        current: currentVisibleStep,
        total: visibleSteps,
      },
      context.language
    )}`

    let footer = this.i18n.t('workflows.common.navigation_hint', {}, context.language)
    if (step.canGoBack === false || context.history.length <= 1) {
      footer = this.i18n.t('workflows.common.navigation_forward_only', {}, context.language)
    }

    return this.messageBuilder.build({
      content,
      subheader,
      footer,
      language: context.language,
      params: context.data,
    })
  }

  private countVisibleSteps(workflowId: string): number {
    const workflow = WorkflowRegistry.getInstance().createInstance(workflowId)
    if (!workflow) return 0

    const definition = workflow.getDefinition()
    return definition.steps.filter((step) => step.type === 'input' || step.type === 'choice').length
  }

  private getCurrentVisibleStepNumber(workflowId: string, currentIndex: number): number {
    const workflow = WorkflowRegistry.getInstance().createInstance(workflowId)
    if (!workflow) return 1

    const definition = workflow.getDefinition()
    let visibleCount = 0

    for (let i = 0; i <= currentIndex; i++) {
      const step = definition.steps[i]
      if (step && (step.type === 'input' || step.type === 'choice')) {
        visibleCount++
      }
    }

    return visibleCount || 1
  }

  private getExecutorKey(sessionContext: SessionContext): string {
    return `${sessionContext.channel}:${sessionContext.channelUserId}`
  }

  public getStats(): {
    activeWorkflows: number
    executorKeys: string[]
  } {
    return {
      activeWorkflows: this.executors.size,
      executorKeys: Array.from(this.executors.keys()),
    }
  }
}
