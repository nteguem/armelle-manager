import {
  WorkflowContext,
  StepResult,
  WorkflowDefinition,
  isTransitionResult,
} from './workflow_context.js'
import type { SessionContext } from '#bot/types/bot_types'
import { StepProcessor } from './step_processor.js'
import { TransitionEngine } from './transition_engine.js'
import logger from '@adonisjs/core/services/logger'

export class WorkflowEngine {
  private static instance: WorkflowEngine
  private stepProcessor: StepProcessor
  private transitionEngine: TransitionEngine
  private workflows: Map<string, WorkflowDefinition> = new Map()

  private constructor() {
    this.stepProcessor = new StepProcessor()
    this.transitionEngine = new TransitionEngine()
  }

  public static getInstance(): WorkflowEngine {
    if (!WorkflowEngine.instance) {
      WorkflowEngine.instance = new WorkflowEngine()
    }
    return WorkflowEngine.instance
  }

  public registerWorkflow(workflow: WorkflowDefinition): void {
    this.workflows.set(workflow.id, workflow)
    logger.info(`Workflow registered: ${workflow.id}`)
  }

  public async startWorkflow(
    sessionContext: SessionContext,
    workflowId: string
  ): Promise<StepResult> {
    const workflow = this.workflows.get(workflowId)
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`)
    }

    const workflowContext: WorkflowContext = {
      workflowId,
      currentStep: workflow.startStep,
      session: sessionContext,
      variables: {},
      execution: {
        startedAt: new Date(),
        stepStartedAt: new Date(),
        retryCount: 0,
      },
    }

    sessionContext.currentWorkflow = workflowId
    sessionContext.currentStep = workflow.startStep
    sessionContext.workflowData = workflowContext.variables

    return this.processStep(workflowContext)
  }

  public async processStep(
    workflowContext: WorkflowContext,
    userInput?: string
  ): Promise<StepResult> {
    const workflow = this.workflows.get(workflowContext.workflowId)
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowContext.workflowId}`)
    }

    const stepDefinition = workflow.steps[workflowContext.currentStep]
    if (!stepDefinition) {
      throw new Error(`Step not found: ${workflowContext.currentStep}`)
    }

    try {
      workflowContext.execution.stepStartedAt = new Date()
      const result = await this.stepProcessor.process(stepDefinition, workflowContext, userInput)

      // Sauvegarder données selon type de résultat
      if ('saveData' in result && result.saveData) {
        Object.assign(workflowContext.variables, result.saveData)
        workflowContext.session.workflowData = workflowContext.variables
      }

      // Traiter transitions
      if (isTransitionResult(result)) {
        return this.handleTransition(result, workflowContext, stepDefinition)
      }

      return result
    } catch (error) {
      logger.error(`Step error: ${workflowContext.currentStep}`, error)
      return {
        action: 'validation_error',
        error: error.message || 'Erreur étape',
      }
    }
  }

  private async handleTransition(
    result: any,
    workflowContext: WorkflowContext,
    stepDefinition: any
  ): Promise<StepResult> {
    const nextStep =
      result.nextStep ||
      this.transitionEngine.resolve(stepDefinition.nextStep, workflowContext.variables)

    if (!nextStep) {
      return { action: 'complete_workflow' }
    }

    workflowContext.currentStep = nextStep
    workflowContext.session.currentStep = nextStep

    if (result.shouldProcessNext) {
      return this.processStep(workflowContext)
    }

    return { ...result, nextStep }
  }

  public async completeWorkflow(workflowContext: WorkflowContext): Promise<void> {
    workflowContext.session.currentWorkflow = undefined
    workflowContext.session.currentStep = undefined
    workflowContext.session.workflowData = {}
  }

  public getWorkflow(workflowId: string): WorkflowDefinition | undefined {
    return this.workflows.get(workflowId)
  }

  public getAvailableWorkflows(): string[] {
    return Array.from(this.workflows.keys())
  }
}
