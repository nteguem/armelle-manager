import {
  StepResult,
  WorkflowContext,
  isMessageResult,
  isServiceResult,
  isTransitionResult,
  isWorkflowCompleteResult,
  isValidationErrorResult,
} from '../engine/workflow_context.js'
import { WorkflowEngine } from '../engine/workflow_engine.js'
import SessionManager from '#bot/core/managers/session_manager'
import ServiceResultHandler from './service_result_handler.js'
import { MessagePresenter } from '../presentation/message_presenter.js'
import { SessionContext } from '#bot/types/bot_types'

export default class StepResultHandler {
  private workflowEngine: WorkflowEngine
  private sessionManager: SessionManager
  private serviceResultHandler: ServiceResultHandler
  private messagePresenter: MessagePresenter

  constructor() {
    this.workflowEngine = WorkflowEngine.getInstance()
    this.sessionManager = SessionManager.getInstance()
    this.serviceResultHandler = new ServiceResultHandler()
    this.messagePresenter = MessagePresenter.getInstance()
  }

  public async handle(
    result: StepResult,
    context: SessionContext | WorkflowContext
  ): Promise<void> {
    const sessionContext = 'session' in context ? context.session : context
    const workflowContext =
      'session' in context ? context : this.createWorkflowContext(sessionContext)

    if (isMessageResult(result)) {
      await this.handleMessageResult(result, workflowContext)
    } else if (isServiceResult(result)) {
      await this.handleServiceResult(result, workflowContext)
    } else if (isTransitionResult(result)) {
      await this.handleTransitionResult(result, workflowContext)
    } else if (isWorkflowCompleteResult(result)) {
      await this.handleWorkflowCompleteResult(result, workflowContext)
    } else if (isValidationErrorResult(result)) {
      await this.handleValidationErrorResult(result, workflowContext)
    }
  }

  private async handleMessageResult(result: any, context: WorkflowContext): Promise<void> {
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

  private async handleServiceResult(result: any, context: WorkflowContext): Promise<void> {
    await this.serviceResultHandler.handle(result, context)
  }

  private async handleTransitionResult(result: any, context: WorkflowContext): Promise<void> {
    if (result.nextStep) {
      context.currentStep = result.nextStep
      context.session.currentStep = result.nextStep

      if (result.shouldProcessNext) {
        await this.processNextWorkflowStep(context)
      }
    }
  }

  private async handleWorkflowCompleteResult(result: any, context: WorkflowContext): Promise<void> {
    if (result.messageKey) {
      const finalMessage = this.messagePresenter.formatCompletion(context, context.variables)
      await this.sendMessage(context.session, finalMessage)
    }

    await this.sessionManager.endWorkflow(context.session)
    await this.workflowEngine.completeWorkflow(context)
  }

  private async handleValidationErrorResult(result: any, context: WorkflowContext): Promise<void> {
    const errorMessage = this.messagePresenter.formatError(
      result.error || 'Erreur de validation',
      context
    )
    await this.sendMessage(context.session, errorMessage)
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
      await this.handle(result, context)
    } catch (error) {
      console.error('Error processing next workflow step:', error)
    }
  }

  private async sendMessage(sessionContext: SessionContext, content: string): Promise<void> {
    // Cette méthode sera fournie par injection
    console.log('Send message - to be provided by injection')
  }
}
