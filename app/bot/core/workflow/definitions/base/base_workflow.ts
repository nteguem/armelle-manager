import type {
  Workflow,
  WorkflowDefinition,
  WorkflowStep,
  WorkflowContext,
  StepResult,
  ValidationResult,
  WorkflowChoice,
} from '#bot/contracts/workflow.contract'
import type { SessionContext } from '#bot/types/bot_types'
import I18nManager from '#bot/core/managers/i18n_manager'
import MessageBuilder from '#bot/core/managers/message_builder'
import logger from '@adonisjs/core/services/logger'

export abstract class BaseWorkflow implements Workflow {
  protected i18n: I18nManager
  protected messageBuilder: MessageBuilder
  protected services: Map<string, any> = new Map()

  constructor() {
    this.i18n = I18nManager.getInstance()
    this.messageBuilder = new MessageBuilder()
  }

  abstract getDefinition(): WorkflowDefinition

  getStep(stepId: string): WorkflowStep | undefined {
    return this.getDefinition().steps.find((step) => step.id === stepId)
  }

  canActivate(session: SessionContext): boolean {
    const definition = this.getDefinition()

    if (definition.activation?.condition) {
      return definition.activation.condition(session)
    }

    if (definition.type === 'system') {
      return !session.isVerified
    }

    return session.isVerified
  }

  async initialize(context: WorkflowContext): Promise<void> {
    await this.onInitialize(context)
  }

  protected async onInitialize(context: WorkflowContext): Promise<void> {
    // Override si nécessaire
  }

  async executeStep(stepId: string, input: string, context: WorkflowContext): Promise<StepResult> {
    const step = this.getStep(stepId)

    if (!step) {
      return {
        success: false,
        error: `Step ${stepId} not found`,
      }
    }

    try {
      if (step.skipIf && step.skipIf(context)) {
        return this.moveToNextStep(step, context)
      }

      switch (step.type) {
        case 'input':
          return this.executeInputStep(step, input, context)

        case 'choice':
          return this.executeChoiceStep(step, input, context)

        case 'message':
          return this.executeMessageStep(step, context)

        case 'service':
          return this.executeServiceStep(step, context)

        case 'condition':
          return this.executeConditionStep(step, context)

        default:
          return {
            success: false,
            error: `Unknown step type: ${step.type}`,
          }
      }
    } catch (error: any) {
      logger.error(
        {
          workflowId: context.workflowId,
          stepId,
          error: error.message,
        },
        'Step execution failed'
      )

      return {
        success: false,
        error: error.message,
      }
    }
  }

  protected executeInputStep(
    step: WorkflowStep,
    input: string,
    context: WorkflowContext
  ): StepResult {
    context.set(step.id, input)
    return this.moveToNextStep(step, context)
  }

  protected executeChoiceStep(
    step: WorkflowStep,
    input: string,
    context: WorkflowContext
  ): StepResult {
    const choices = this.resolveChoices(step, context)

    let selectedChoice: WorkflowChoice | undefined

    const index = Number.parseInt(input, 10) - 1
    if (!Number.isNaN(index) && index >= 0 && index < choices.length) {
      selectedChoice = choices[index]
    }

    if (!selectedChoice) {
      selectedChoice = choices.find((c) => c.id === input)
    }

    if (!selectedChoice) {
      return {
        success: false,
        error: 'Invalid choice',
      }
    }

    context.set(step.id, selectedChoice.value)

    if (selectedChoice.next) {
      return {
        success: true,
        nextStepId: selectedChoice.next,
      }
    }

    return this.moveToNextStep(step, context)
  }

  protected executeMessageStep(step: WorkflowStep, context: WorkflowContext): StepResult {
    return this.moveToNextStep(step, context)
  }

  protected async executeServiceStep(
    step: WorkflowStep,
    context: WorkflowContext
  ): Promise<StepResult> {
    if (!step.service) {
      return {
        success: false,
        error: 'Service configuration missing',
      }
    }

    const service = this.services.get(step.service.name)
    if (!service) {
      logger.error(
        {
          serviceName: step.service.name,
          availableServices: Array.from(this.services.keys()),
        },
        'Service not found'
      )

      return {
        success: false,
        error: `Service ${step.service.name} not found`,
      }
    }

    try {
      const params = step.service.params ? step.service.params(context) : {}

      const method = service[step.service.method]
      if (typeof method !== 'function') {
        logger.error(
          {
            serviceName: step.service.name,
            methodName: step.service.method,
            availableMethods: Object.getOwnPropertyNames(Object.getPrototypeOf(service)),
          },
          'Method not found'
        )

        return {
          success: false,
          error: `Method ${step.service.method} not found on service ${step.service.name}`,
        }
      }

      const result = await method.call(service, params, context)

      context.set(step.id, result)

      const processed = await this.processServiceResult(step, result, context)
      if (processed) {
        return processed
      }

      return this.moveToNextStep(step, context)
    } catch (error: any) {
      logger.error(
        {
          step: step.id,
          service: step.service.name,
          method: step.service.method,
          error: error.message,
        },
        'Service execution failed'
      )

      return {
        success: false,
        error: error.message,
      }
    }
  }

  protected executeConditionStep(step: WorkflowStep, context: WorkflowContext): StepResult {
    return this.moveToNextStep(step, context)
  }

  protected async processServiceResult(
    step: WorkflowStep,
    result: any,
    context: WorkflowContext
  ): Promise<StepResult | null> {
    return null
  }

  validateInput(stepId: string, input: string, context: WorkflowContext): ValidationResult {
    const step = this.getStep(stepId)

    if (!step) {
      return { valid: false, error: 'Step not found' }
    }

    if (step.type === 'message' || step.type === 'service' || step.type === 'condition') {
      return { valid: true }
    }

    if (step.type === 'choice') {
      return this.validateChoice(step, input, context)
    }

    if (step.type === 'input') {
      return this.validateTextInput(step, input, context)
    }

    return { valid: true }
  }

  protected validateChoice(
    step: WorkflowStep,
    input: string,
    context: WorkflowContext
  ): ValidationResult {
    const choices = this.resolveChoices(step, context)

    const index = Number.parseInt(input, 10) - 1
    if (!Number.isNaN(index) && index >= 0 && index < choices.length) {
      return { valid: true, sanitized: input }
    }

    if (choices.find((c) => c.id === input)) {
      return { valid: true, sanitized: input }
    }

    return {
      valid: false,
      error: this.i18n.t('workflows.invalid_choice', {}, context.session.language),
    }
  }

  protected validateTextInput(
    step: WorkflowStep,
    input: string,
    context: WorkflowContext
  ): ValidationResult {
    const validation = step.validation
    const trimmed = input.trim()

    if (!validation) {
      if (trimmed.length === 0) {
        return {
          valid: false,
          error: this.i18n.t('workflows.field_required', {}, context.session.language),
        }
      }
      return { valid: true, sanitized: trimmed }
    }

    if (validation.required && trimmed.length === 0) {
      return {
        valid: false,
        error: this.i18n.t('workflows.field_required', {}, context.session.language),
      }
    }

    if (validation.min && trimmed.length < validation.min) {
      return {
        valid: false,
        error: this.i18n.t(
          'workflows.min_length',
          { min: validation.min },
          context.session.language
        ),
      }
    }

    if (validation.max && trimmed.length > validation.max) {
      return {
        valid: false,
        error: this.i18n.t(
          'workflows.max_length',
          { max: validation.max },
          context.session.language
        ),
      }
    }

    if (validation.pattern && !validation.pattern.test(trimmed)) {
      return {
        valid: false,
        error: this.i18n.t('workflows.invalid_format', {}, context.session.language),
      }
    }

    if (validation.custom) {
      const customResult = validation.custom(trimmed, context)
      if (typeof customResult === 'string') {
        return { valid: false, error: customResult }
      }
      if (!customResult) {
        return {
          valid: false,
          error: this.i18n.t('workflows.validation_failed', {}, context.session.language),
        }
      }
    }

    return { valid: true, sanitized: trimmed }
  }

  getNextStep(currentStepId: string, context: WorkflowContext): string | null {
    const step = this.getStep(currentStepId)
    if (!step) return null

    if (step.next) {
      const next = typeof step.next === 'function' ? step.next(context) : step.next
      return next
    }

    const steps = this.getDefinition().steps
    const currentIndex = steps.findIndex((s) => s.id === currentStepId)

    if (currentIndex >= 0 && currentIndex < steps.length - 1) {
      return steps[currentIndex + 1].id
    }

    return null
  }

  protected moveToNextStep(step: WorkflowStep, context: WorkflowContext): StepResult {
    const nextStepId = this.getNextStep(step.id, context)

    if (!nextStepId) {
      return {
        success: true,
        completed: true,
        data: context.state.data,
      }
    }

    return {
      success: true,
      nextStepId,
    }
  }

  protected resolveChoices(step: WorkflowStep, context: WorkflowContext): WorkflowChoice[] {
    if (!step.choices) return []

    return typeof step.choices === 'function' ? step.choices(context) : step.choices
  }

  registerService(name: string, service: any): void {
    this.services.set(name, service)
  }
}
