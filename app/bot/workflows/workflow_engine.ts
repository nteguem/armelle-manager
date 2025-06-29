import type {
  BotSessionExtended,
  IncomingMessage,
  WorkflowStep,
  ActionResult,
  ValidationResult,
} from '#bot/types/bot_types'
import { BaseWorkflow } from './base_workflow.js'
import SessionManager from '#bot/services/session_manager'
import logger from '@adonisjs/core/services/logger'

export default class WorkflowEngine {
  private workflows = new Map<string, BaseWorkflow>()
  private sessionManager: SessionManager

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager
  }

  registerWorkflow(workflow: BaseWorkflow): void {
    this.workflows.set(workflow.id, workflow)
    logger.info({ workflowId: workflow.id }, 'Workflow registered')
  }

  async startWorkflow(workflowId: string, session: BotSessionExtended): Promise<void> {
    const workflow = this.workflows.get(workflowId)
    if (!workflow) {
      logger.error({ workflowId }, 'Workflow not found')
      throw new Error(`Workflow ${workflowId} not found`)
    }

    // Sauvegarder l'état pour navigation
    await this.sessionManager.pushNavigationState(session)

    session.currentWorkflow = workflowId
    session.currentStep = workflow.initialStep
    await session.save()

    logger.info(
      { workflowId, stepId: workflow.initialStep, userId: session.botUserId },
      'Workflow started'
    )
    await this.executeStep(session, workflow.initialStep)
  }

  async processStep(session: BotSessionExtended, message: IncomingMessage): Promise<void> {
    const workflow = this.workflows.get(session.currentWorkflow!)
    if (!workflow) throw new Error(`Workflow ${session.currentWorkflow} not found`)

    const step = workflow.getStep(session.currentStep!)

    // Validation
    if (step.validation) {
      const validationResult = await this.validateInput(message.content, step.validation)
      if (!validationResult.valid) {
        await this.sendValidationError(session, validationResult.error!)
        return
      }
      // Sauvegarder la valeur validée
      session.currentContext[step.id] = validationResult.sanitizedValue || message.content
    } else {
      session.currentContext[step.id] = message.content
    }

    // Exécuter l'action si définie
    let actionResult: ActionResult | null = null
    if (step.action) {
      actionResult = await workflow.executeAction(step.action, session, message)
      if (actionResult.data) {
        session.currentContext = { ...session.currentContext, ...actionResult.data }
      }
    }

    // Résoudre la prochaine étape
    const nextStep = this.resolveNextStep(step, session.currentContext, actionResult)

    if (nextStep === 'END') {
      await this.endWorkflow(session)
    } else {
      await this.updateStepAndSubflow(session, nextStep, workflow)
      await this.executeStep(session, nextStep)
    }
  }

  async executeStep(session: BotSessionExtended, stepId: string): Promise<void> {
    const workflow = this.workflows.get(session.currentWorkflow!)!
    const step = workflow.getStep(stepId)

    session.currentStep = stepId
    await session.save()

    // Construire et envoyer le message
    const message = await workflow.buildStepMessage(step, session)
    this.emit('send_message', { session, content: message })

    logger.debug(
      {
        workflowId: session.currentWorkflow,
        stepId,
        userId: session.botUserId,
      },
      'Step executed'
    )
  }

  private resolveNextStep(
    step: WorkflowStep,
    context: Record<string, any>,
    actionResult: ActionResult | null
  ): string {
    // Transition spécifique de l'action
    if (actionResult?.transition) {
      return actionResult.transition
    }

    // Transition par défaut
    return step.transitions.default || 'END'
  }

  private async updateStepAndSubflow(
    session: BotSessionExtended,
    nextStepId: string,
    workflow: BaseWorkflow
  ): Promise<void> {
    const nextStep = workflow.getStep(nextStepId)

    if (nextStep.subflowId) {
      const subflow = workflow.getSubflow(nextStep.subflowId)
      const position = subflow.steps.indexOf(nextStepId) + 1
      await this.sessionManager.updateSubflowPosition(session, nextStep.subflowId, position)
    }
  }

  private async validateInput(input: string, validation: any): Promise<ValidationResult> {
    // Validation basique pour l'instant
    if (validation.required && !input.trim()) {
      return { valid: false, error: 'errors.validation.required' }
    }

    if (validation.min && input.length < validation.min) {
      return { valid: false, error: 'errors.validation.too_short' }
    }

    if (validation.max && input.length > validation.max) {
      return { valid: false, error: 'errors.validation.too_long' }
    }

    return { valid: true, sanitizedValue: input.trim() }
  }

  private async sendValidationError(session: BotSessionExtended, errorKey: string): Promise<void> {
    // Sera implémenté avec MessageBuilder
    this.emit('send_error', { session, errorKey })
  }

  private async endWorkflow(session: BotSessionExtended): Promise<void> {
    await this.sessionManager.clearWorkflow(session)
    logger.info(
      { workflowId: session.currentWorkflow, userId: session.botUserId },
      'Workflow ended'
    )
    this.emit('workflow_ended', { session })
  }

  async goBack(session: BotSessionExtended): Promise<boolean> {
    const success = await this.sessionManager.popNavigationState(session)
    if (success && session.currentStep) {
      await this.executeStep(session, session.currentStep)
    }
    return success
  }

  getWorkflow(workflowId: string): BaseWorkflow | undefined {
    return this.workflows.get(workflowId)
  }

  private emit(event: string, data: any): void {
    logger.debug({ event }, 'Workflow engine event emitted')
  }
}
