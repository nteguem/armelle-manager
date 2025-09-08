import type {
  Workflow,
  WorkflowStep,
  StepResult,
  ValidationResult,
} from '#bot/contracts/workflow.contract'
import type { WorkflowContextImpl } from './workflow_context.js'
import I18nManager from '#bot/core/managers/i18n_manager'
import MessageBuilder from '#bot/core/managers/message_builder'
import logger from '@adonisjs/core/services/logger'

export class WorkflowExecutor {
  private workflow: Workflow
  private context: WorkflowContextImpl
  private i18n: I18nManager
  private messageBuilder: MessageBuilder
  private services: Map<string, any> = new Map()

  constructor(workflow: Workflow, context: WorkflowContextImpl) {
    this.workflow = workflow
    this.context = context
    this.i18n = I18nManager.getInstance()
    this.messageBuilder = new MessageBuilder()
  }

  registerService(name: string, service: any): void {
    this.services.set(name, service)

    if ('registerService' in this.workflow) {
      ;(this.workflow as any).registerService(name, service)
    }
  }

  async start(): Promise<StepResult> {
    try {
      const definition = this.workflow.getDefinition()

      if (definition.hooks?.onStart) {
        await definition.hooks.onStart(this.context)
      }

      await this.workflow.initialize(this.context)

      const firstStep = definition.steps[0]
      if (!firstStep) {
        return {
          success: false,
          error: 'No steps defined in workflow',
        }
      }

      this.context.setCurrentStep(firstStep.id)

      const message = await this.buildStepMessage(firstStep)

      logger.info(
        {
          workflowId: this.context.workflowId,
          stepId: firstStep.id,
          language: this.context.session.language,
        },
        'Workflow started'
      )

      return {
        success: true,
        message,
        nextStepId: firstStep.id,
      }
    } catch (error: any) {
      logger.error(
        {
          workflowId: this.context.workflowId,
          error: error.message,
        },
        'Failed to start workflow'
      )

      return {
        success: false,
        error: error.message,
      }
    }
  }

  async processInput(input: string): Promise<StepResult> {
    const currentStepId = this.context.getCurrentStep()
    const currentStep = this.workflow.getStep(currentStepId)

    if (!currentStep) {
      logger.error({ currentStepId }, 'Current step not found')
      return {
        success: false,
        error: 'Current step not found',
      }
    }

    try {
      logger.debug(
        {
          stepId: currentStepId,
          stepType: currentStep.type,
          input: input.substring(0, 50),
        },
        'Processing step input'
      )

      // CORRECTION: Vérifier si c'est une commande de retour AVANT la validation
      if (this.isBackCommand(input)) {
        return this.handleBack()
      }

      if (currentStep.type === 'input' || currentStep.type === 'choice') {
        const validation = this.workflow.validateInput(currentStepId, input, this.context)
        if (!validation.valid) {
          const errorMessage = this.i18n.t(
            'workflows.validation_error',
            { error: validation.error },
            this.context.session.language
          )

          const stepMessage = await this.buildStepMessage(currentStep)
          return {
            success: false,
            message: `${errorMessage}\n\n${stepMessage}`,
            error: validation.error,
          }
        }

        this.context.set(currentStepId, validation.sanitized || input)
      }

      const result = await this.workflow.executeStep(currentStepId, input, this.context)

      const definition = this.workflow.getDefinition()
      if (definition.hooks?.onStepComplete) {
        await definition.hooks.onStepComplete(currentStepId, this.context)
      }

      // Si workflow terminé avec un message, le retourner directement
      if (result.completed) {
        if (result.message) {
          // Le message est déjà construit par processServiceResult
          return result
        }
        // Sinon appeler handleComplete pour les workflows USER
        return this.handleComplete()
      }

      if (result.nextStepId) {
        const nextStep = this.workflow.getStep(result.nextStepId)
        if (nextStep) {
          this.context.setCurrentStep(result.nextStepId)

          logger.debug(
            {
              previousStep: currentStepId,
              nextStep: result.nextStepId,
              nextStepType: nextStep.type,
            },
            'Moving to next step'
          )

          if (nextStep.type === 'message' || nextStep.type === 'service') {
            return this.processInput('')
          }

          const message = await this.buildStepMessage(nextStep)
          return {
            success: true,
            message,
            nextStepId: result.nextStepId,
            data: result.data,
          }
        }
      }

      return result
    } catch (error: any) {
      logger.error(
        {
          workflowId: this.context.workflowId,
          stepId: currentStepId,
          error: error.message,
          stack: error.stack,
        },
        'Error processing input'
      )

      const definition = this.workflow.getDefinition()
      if (definition.hooks?.onError) {
        await definition.hooks.onError(error, this.context)
      }

      return {
        success: false,
        error: error.message,
      }
    }
  }

  private async handleBack(): Promise<StepResult> {
    // CORRECTION: Vérifier si on peut vraiment revenir en arrière
    if (!this.context.canGoBack()) {
      return {
        success: false,
        error: this.i18n.t('workflows.cannot_go_back', {}, this.context.session.language),
      }
    }

    const previousStepId = this.context.goBack()

    if (!previousStepId) {
      return {
        success: false,
        error: this.i18n.t('workflows.cannot_go_back', {}, this.context.session.language),
      }
    }

    const previousStep = this.workflow.getStep(previousStepId)
    if (!previousStep) {
      return {
        success: false,
        error: 'Previous step not found',
      }
    }

    // CORRECTION: Nettoyer les données de l'étape actuelle quand on revient
    const currentStepId = this.context.getHistory()[this.context.getHistory().length]
    if (currentStepId) {
      this.context.delete(currentStepId)
    }

    logger.info(
      {
        workflowId: this.context.workflowId,
        from: currentStepId,
        to: previousStepId,
      },
      'Stepping back in workflow'
    )

    const message = await this.buildStepMessage(previousStep)

    return {
      success: true,
      message,
      nextStepId: previousStepId,
    }
  }

  private async handleComplete(): Promise<StepResult> {
    const definition = this.workflow.getDefinition()

    if (definition.hooks?.onComplete) {
      await definition.hooks.onComplete(this.context)
    }

    logger.info(
      {
        workflowId: this.context.workflowId,
        duration: this.context.getElapsedTime(),
        steps: this.context.getHistory().length,
        language: this.context.session.language,
        data: this.context.state.data,
      },
      'Workflow completed'
    )

    // Pour les workflows SYSTEM, ne pas reconstruire de message
    if (definition.type === 'system') {
      return {
        success: true,
        completed: true,
        data: this.context.state.data,
      }
    }

    // Pour les workflows USER, message générique
    const completionMessage = this.i18n.t(
      `workflows.${this.context.workflowId}.completion`,
      this.context.state.data,
      this.context.session.language
    )

    return {
      success: true,
      completed: true,
      message: this.messageBuilder.build({
        content: completionMessage,
        footer: this.i18n.t('common.footer_options', {}, this.context.session.language),
        language: this.context.session.language,
      }),
      data: this.context.state.data,
    }
  }

  async cancel(): Promise<StepResult> {
    const definition = this.workflow.getDefinition()

    if (definition.hooks?.onCancel) {
      await definition.hooks.onCancel(this.context)
    }

    logger.info(
      {
        workflowId: this.context.workflowId,
        cancelledAt: this.context.getCurrentStep(),
      },
      'Workflow cancelled'
    )

    const message = this.i18n.t('workflows.cancelled', {}, this.context.session.language)

    return {
      success: true,
      completed: true,
      message: this.messageBuilder.build({
        content: message,
        footer: this.i18n.t('common.footer_options', {}, this.context.session.language),
        language: this.context.session.language,
      }),
    }
  }

  private async buildStepMessage(step: WorkflowStep): Promise<string> {
    const definition = this.workflow.getDefinition()
    const language = this.context.session.language

    let prompt = ''
    if (step.prompt) {
      prompt =
        typeof step.prompt === 'function'
          ? step.prompt(this.context)
          : this.i18n.t(step.prompt, this.context.state.data, language)
    }

    if (step.type === 'choice' && step.choices) {
      const choices = typeof step.choices === 'function' ? step.choices(this.context) : step.choices

      const choiceText = choices
        .map((choice, index) => {
          const label =
            typeof choice.label === 'function'
              ? choice.label(language)
              : this.i18n.t(choice.label, {}, language)
          return `${index + 1}. ${label}`
        })
        .join('\n')

      prompt = `${prompt}\n\n${choiceText}`
    }

    const workflowName =
      typeof definition.name === 'function'
        ? definition.name(language)
        : this.i18n.t(definition.name, {}, language)

    const history = this.context.getHistory()
    const visibleSteps = definition.steps.filter(
      (s) => s.type === 'input' || s.type === 'choice'
    ).length

    const currentVisibleIndex =
      definition.steps
        .filter((s) => s.type === 'input' || s.type === 'choice')
        .findIndex((s) => s.id === step.id) + 1

    const subheader = `${workflowName} - ${this.i18n.t(
      'common.step_progress',
      { current: currentVisibleIndex, total: visibleSteps },
      language
    )}`

    // CORRECTION: Améliorer le footer avec les bonnes instructions
    let footer = ''
    if (step.canGoBack !== false && this.context.canGoBack()) {
      footer = this.i18n.t('common.navigation.back_and_menu', {}, language)
    } else {
      footer = this.i18n.t('common.navigation.menu_return', {}, language)
    }

    return this.messageBuilder.build({
      content: prompt,
      subheader,
      footer,
      language,
    })
  }

  private isBackCommand(input: string): boolean {
    const normalized = input.toLowerCase().trim()
    // CORRECTION: Ajouter plus de variantes pour "retour"
    return ['retour', 'back', 'precedent', 'previous', '*', 'ret'].includes(normalized)
  }

  getContext(): WorkflowContextImpl {
    return this.context
  }
}
