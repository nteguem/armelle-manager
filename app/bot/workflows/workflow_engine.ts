import BotSession from '#models/bot_session'
import BotUser from '#models/bot_user'
import I18nManager from '#bot/core/i18n_manager'
import MessageBuilder from '#bot/core/message_builder'
import ContextManager from '#bot/core/context_manager'
import InputValidator from '#bot/workflows/validation/input_validator'
import type {
  SupportedLanguage,
  WorkflowDefinition,
  WorkflowStep,
  WorkflowResult,
  Transition,
  ActionContext,
  ActionResult,
} from '#bot/types/bot_types'

export default class WorkflowEngine {
  private readonly workflows = new Map<string, WorkflowDefinition>()
  private readonly actionRegistry = new Map<string, Function>()
  private readonly i18n: I18nManager
  private readonly messageBuilder: MessageBuilder
  private readonly contextManager: ContextManager

  constructor() {
    this.i18n = I18nManager.getInstance()
    this.messageBuilder = new MessageBuilder()
    this.contextManager = new ContextManager()
  }

  public registerWorkflow(workflow: WorkflowDefinition, actions?: Record<string, Function>): void {
    this.workflows.set(workflow.id, workflow)

    if (actions) {
      Object.entries(actions).forEach(([actionName, handler]) => {
        const fullActionName = `${workflow.id}.${actionName}`
        this.actionRegistry.set(fullActionName, handler)
      })
    }
  }

  public async startWorkflow(
    sessionId: string,
    workflowId: string,
    initialData: Record<string, any> = {}
  ): Promise<WorkflowResult> {
    const workflow = this.workflows.get(workflowId)
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`)
    }

    const session = await BotSession.findOrFail(sessionId)
    const botUser = await session.related('botUser').query().firstOrFail()

    await this.contextManager.startWorkflow(
      sessionId,
      workflowId,
      workflow.initialStep,
      initialData
    )

    return await this.processStepExecution(
      session,
      botUser,
      workflow,
      workflow.initialStep,
      initialData
    )
  }

  public async processInput(sessionId: string, userInput: string): Promise<WorkflowResult> {
    const session = await BotSession.findOrFail(sessionId)
    const botUser = await session.related('botUser').query().firstOrFail()

    if (!session.currentWorkflow || !session.currentStep) {
      throw new Error('No active workflow in session')
    }

    const workflow = this.workflows.get(session.currentWorkflow)
    if (!workflow) {
      throw new Error(`Workflow not found: ${session.currentWorkflow}`)
    }

    const currentStep = workflow.steps[session.currentStep]
    if (!currentStep) {
      throw new Error(`Step not found: ${session.currentStep}`)
    }

    if (this.isLanguageChange(userInput)) {
      return await this.handleLanguageChange(sessionId, userInput, currentStep, botUser)
    }

    if (currentStep.type !== 'api') {
      const validation = InputValidator.validate(userInput, currentStep.validation)
      if (!validation.isValid) {
        return await this.renderValidationError(session, botUser, currentStep, validation.error!)
      }

      const stepData = { [currentStep.id]: validation.value }
      await this.contextManager.moveToStep(sessionId, currentStep.id, stepData)
    }

    const nextTransition = this.resolveTransition(currentStep, userInput)

    if (!nextTransition) {
      return await this.renderValidationError(session, botUser, currentStep, 'invalid_choice')
    }

    if (nextTransition.action) {
      const actionResult = await this.executeAction(
        nextTransition.action,
        userInput,
        session.currentContext,
        sessionId
      )

      if (actionResult?.nextStep) {
        const dynamicTransition = currentStep.transitions[actionResult.nextStep]
        if (dynamicTransition) {
          return await this.processTransition(sessionId, workflow, dynamicTransition)
        }
      }
    }

    return await this.processTransition(sessionId, workflow, nextTransition)
  }

  private isLanguageChange(input: string): boolean {
    const cleanInput = input.trim().toUpperCase()
    return cleanInput === 'EN' || cleanInput === 'FR'
  }

  private async handleLanguageChange(
    sessionId: string,
    input: string,
    currentStep: WorkflowStep,
    botUser: BotUser
  ): Promise<WorkflowResult> {
    const newLanguage = input.trim().toLowerCase() as SupportedLanguage

    await this.contextManager.changeLanguage(sessionId, newLanguage)
    await botUser.setLanguage(newLanguage)

    const session = await BotSession.findOrFail(sessionId)
    const updatedBotUser = await session.related('botUser').query().firstOrFail()
    const message = this.buildStepMessage(
      currentStep,
      updatedBotUser.language,
      session.currentContext
    )

    return {
      success: true,
      response: message,
      nextStep: currentStep.id,
    }
  }

  private async processTransition(
    sessionId: string,
    workflow: WorkflowDefinition,
    transition: Transition
  ): Promise<WorkflowResult> {
    if (transition.target === 'END') {
      await this.contextManager.completeWorkflow(sessionId)
      const session = await BotSession.findOrFail(sessionId)
      const botUser = await session.related('botUser').query().firstOrFail()

      return {
        success: true,
        response: this.buildCompletionMessage(
          workflow.id,
          botUser.language,
          session.currentContext
        ),
        completed: true,
      }
    }

    const session = await BotSession.findOrFail(sessionId)
    const botUser = await session.related('botUser').query().firstOrFail()

    return await this.processStepExecution(
      session,
      botUser,
      workflow,
      transition.target,
      session.currentContext
    )
  }

  private async processStepExecution(
    session: BotSession,
    botUser: BotUser,
    workflow: WorkflowDefinition,
    stepId: string,
    context: Record<string, any>
  ): Promise<WorkflowResult> {
    const step = workflow.steps[stepId]
    if (!step) {
      throw new Error(`Step not found: ${stepId}`)
    }

    await this.contextManager.moveToStep(session.id, stepId)

    if (step.type === 'api') {
      return await this.executeAPIStep(session.id, workflow, step)
    }

    const message = this.buildStepMessage(step, botUser.language, context)
    return {
      success: true,
      response: message,
      nextStep: stepId,
    }
  }

  private async executeAPIStep(
    sessionId: string,
    workflow: WorkflowDefinition,
    step: WorkflowStep
  ): Promise<WorkflowResult> {
    const session = await BotSession.findOrFail(sessionId)

    const defaultTransition = step.transitions.default
    if (!defaultTransition?.action) {
      throw new Error(`API step ${step.id} must have a default transition with action`)
    }

    const actionResult = await this.executeAction(
      defaultTransition.action,
      '',
      session.currentContext,
      sessionId
    )

    if (actionResult?.nextStep) {
      const nextTransition = step.transitions[actionResult.nextStep]
      if (nextTransition) {
        return await this.processTransition(sessionId, workflow, nextTransition)
      }
    }

    return await this.processTransition(sessionId, workflow, defaultTransition)
  }

  private resolveTransition(step: WorkflowStep, input: string): Transition | null {
    if (step.type === 'menu') {
      return step.transitions[input.trim()] || null
    }

    return step.transitions.valid_input || step.transitions.default || null
  }

  private async executeAction(
    action: string,
    input: string = '',
    context: Record<string, any> = {},
    sessionId: string = ''
  ): Promise<ActionResult | null> {
    const session = await BotSession.findOrFail(sessionId)
    const workflowId = session.currentWorkflow

    if (!workflowId) {
      throw new Error('No active workflow for action execution')
    }

    const fullActionName = `${workflowId}.${action}`
    const actionHandler = this.actionRegistry.get(fullActionName)

    if (!actionHandler) {
      return null
    }

    const actionContext: ActionContext = {
      sessionId,
      context,
      input,
      session,
      botUser: await session.related('botUser').query().firstOrFail(),
    }

    return await actionHandler(actionContext)
  }

  private async renderValidationError(
    session: BotSession,
    botUser: BotUser,
    step: WorkflowStep,
    error: string
  ): Promise<WorkflowResult> {
    const errorMessage = this.messageBuilder.buildValidationError(error, botUser.language)
    const originalMessage = this.buildStepMessage(step, botUser.language, session.currentContext)
    const combinedMessage = this.combineErrorWithOriginal(errorMessage, originalMessage)

    return {
      success: false,
      response: combinedMessage,
      error: error,
      nextStep: step.id,
    }
  }

  private combineErrorWithOriginal(errorMessage: string, originalMessage: string): string {
    const lines = originalMessage.split('\n')
    const headerIndex = lines.findIndex((line) => line.includes('['))
    const titleIndex = lines.findIndex(
      (line) => line.trim() && !line.includes('[') && !line.includes('-----')
    )

    if (headerIndex !== -1 && titleIndex !== -1) {
      lines.splice(titleIndex + 2, 0, errorMessage, '')
    }

    return lines.join('\n')
  }

  private buildStepMessage(
    step: WorkflowStep,
    language: SupportedLanguage,
    context: Record<string, any>
  ): string {
    let subheader: string | undefined
    let footer: string | undefined

    if (
      step.id.includes('collect_name') ||
      step.id.includes('search_dgi') ||
      step.id.includes('confirm') ||
      step.id.includes('select') ||
      step.id.includes('manual_niu') ||
      step.id.includes('verify_niu')
    ) {
      subheader = 'common.step_progress'
      context.current = step.id.includes('collect_name')
        ? 1
        : step.id.includes('search_dgi') ||
            step.id.includes('no_results') ||
            step.id.includes('dgi_error')
          ? 2
          : 3
      context.total = 3
    }

    if (step.type === 'input') {
      footer = 'common.retry_footer'
    } else if (step.type === 'menu') {
      footer = 'common.menu_footer'
    }

    return this.messageBuilder.build({
      content: step.messageKey,
      subheader,
      footer,
      language,
      params: context,
    })
  }

  private buildCompletionMessage(
    workflowId: string,
    language: SupportedLanguage,
    context: Record<string, any>
  ): string {
    return this.messageBuilder.build({
      content: `workflows.${workflowId}.completed`,
      language,
      params: context,
    })
  }
}
