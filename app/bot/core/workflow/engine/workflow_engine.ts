import type { WorkflowContext, StepResult, WorkflowDefinition } from './workflow_context.js'
import type { SessionContext } from '#bot/types/bot_types'
import { StepProcessor } from './step_processor.js'
import { TransitionResolver } from './transition_resolver.js'
import logger from '@adonisjs/core/services/logger'

/**
 * Moteur d'exécution des workflows
 * Orchestrateur central - logique métier dans les steps
 */
export class WorkflowEngine {
  private static instance: WorkflowEngine
  private stepProcessor: StepProcessor
  private transitionResolver: TransitionResolver
  private workflows: Map<string, WorkflowDefinition> = new Map()

  private constructor() {
    this.stepProcessor = new StepProcessor()
    this.transitionResolver = new TransitionResolver()
  }

  public static getInstance(): WorkflowEngine {
    if (!WorkflowEngine.instance) {
      WorkflowEngine.instance = new WorkflowEngine()
    }
    return WorkflowEngine.instance
  }

  /**
   * Enregistre un workflow dans le moteur
   */
  public registerWorkflow(workflow: WorkflowDefinition): void {
    this.workflows.set(workflow.id, workflow)
    logger.info(`Workflow registered: ${workflow.id}`)
  }

  /**
   * Démarre un nouveau workflow
   */
  public async startWorkflow(
    sessionContext: SessionContext,
    workflowId: string
  ): Promise<StepResult> {
    const workflow = this.workflows.get(workflowId)
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`)
    }

    // Créer contexte workflow
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

    // Mettre à jour la session
    sessionContext.currentWorkflow = workflowId
    sessionContext.currentStep = workflow.startStep
    sessionContext.workflowData = workflowContext.variables

    logger.debug(`Started workflow: ${workflowId}, first step: ${workflow.startStep}`)

    // Exécuter première étape
    return this.processStep(workflowContext)
  }

  /**
   * Traite une étape du workflow
   */
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

    logger.debug(`Processing step: ${workflowContext.workflowId}:${workflowContext.currentStep}`)

    try {
      workflowContext.execution.stepStartedAt = new Date()

      // Traiter l'étape
      const result = await this.stepProcessor.process(stepDefinition, workflowContext, userInput)

      // Sauvegarder données si présentes
      if (result.saveData) {
        Object.assign(workflowContext.variables, result.saveData)
        workflowContext.session.workflowData = workflowContext.variables
      }

      // ✅ CORRECTION : Gérer l'action call_service différemment
      if (result.action === 'call_service') {
        // Retourner le result tel quel pour que MessageDispatcher gère l'appel
        return result
      }

      // Résoudre transition si nécessaire
      if (result.action === 'transition') {
        const nextStep = this.transitionResolver.resolve(
          stepDefinition.nextStep,
          workflowContext.variables
        )

        if (nextStep) {
          workflowContext.currentStep = nextStep
          workflowContext.session.currentStep = nextStep

          return {
            ...result,
            nextStep,
            shouldProcessNext: true,
          }
        } else {
          return {
            action: 'complete_workflow',
          }
        }
      }

      return result
    } catch (error) {
      logger.error(
        `Step processing error: ${workflowContext.workflowId}:${workflowContext.currentStep}`,
        error
      )
      throw error
    }
  }
  /**
   * Termine un workflow
   */
  public async completeWorkflow(workflowContext: WorkflowContext): Promise<void> {
    logger.info(`Workflow completed: ${workflowContext.workflowId}`)

    // Nettoyer contexte session
    workflowContext.session.currentWorkflow = undefined
    workflowContext.session.currentStep = undefined
  }

  /**
   * Récupère définition workflow
   */
  public getWorkflow(workflowId: string): WorkflowDefinition | undefined {
    return this.workflows.get(workflowId)
  }

  /**
   * Liste workflows disponibles
   */
  public getAvailableWorkflows(): string[] {
    return Array.from(this.workflows.keys())
  }
}
