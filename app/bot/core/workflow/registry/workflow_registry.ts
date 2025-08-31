// app/bot/core/workflow/registry/workflow_registry.ts

import type { WorkflowDefinition } from '../engine/workflow_context.js'
import { WorkflowEngine } from '../engine/workflow_engine.js'
import { ProgressTracker } from '../presentation/progress_tracker.js'
import logger from '@adonisjs/core/services/logger'

/**
 * Métadonnées workflow pour registre
 */
interface WorkflowMetadata {
  definition: WorkflowDefinition
  registeredAt: Date
  version?: string
  description?: string
}

/**
 * Registre central des workflows
 * Catalogue et initialise tous workflows disponibles
 */
export class WorkflowRegistry {
  private static instance: WorkflowRegistry
  private workflows: Map<string, WorkflowMetadata> = new Map()
  private engine: WorkflowEngine
  private progressTracker: ProgressTracker

  private constructor() {
    this.engine = WorkflowEngine.getInstance()
    this.progressTracker = ProgressTracker.getInstance()
  }

  public static getInstance(): WorkflowRegistry {
    if (!WorkflowRegistry.instance) {
      WorkflowRegistry.instance = new WorkflowRegistry()
    }
    return WorkflowRegistry.instance
  }

  /**
   * Enregistre un workflow dans le système
   */
  public register(
    definition: WorkflowDefinition,
    options: {
      version?: string
      description?: string
      progressConfig?: {
        totalSteps: number
        prefix: string
        stepMapping: Record<string, number>
      }
    } = {}
  ): void {
    // Valider définition workflow
    const validation = this.validateDefinition(definition)
    if (!validation.valid) {
      throw new Error(`Invalid workflow definition for ${definition.id}: ${validation.error}`)
    }

    // Enregistrer dans le registre
    this.workflows.set(definition.id, {
      definition,
      registeredAt: new Date(),
      version: options.version,
      description: options.description,
    })

    // Enregistrer dans le moteur
    this.engine.registerWorkflow(definition)

    // Enregistrer progression si fournie
    if (options.progressConfig) {
      this.progressTracker.registerWorkflowProgress(definition.id, options.progressConfig)
    }

    logger.info(`Workflow registered: ${definition.id}`, {
      version: options.version,
      stepsCount: Object.keys(definition.steps).length,
    })
  }

  /**
   * Récupère métadonnées workflow
   */
  public getWorkflowMetadata(workflowId: string): WorkflowMetadata | undefined {
    return this.workflows.get(workflowId)
  }

  /**
   * Récupère définition workflow
   */
  public getWorkflowDefinition(workflowId: string): WorkflowDefinition | undefined {
    const metadata = this.workflows.get(workflowId)
    return metadata?.definition
  }

  /**
   * Liste tous workflows enregistrés
   */
  public listWorkflows(): {
    id: string
    name: string
    version?: string
    description?: string
    stepsCount: number
    registeredAt: Date
  }[] {
    return Array.from(this.workflows.entries()).map(([id, metadata]) => ({
      id,
      name: metadata.definition.name,
      version: metadata.version,
      description: metadata.description,
      stepsCount: Object.keys(metadata.definition.steps).length,
      registeredAt: metadata.registeredAt,
    }))
  }

  /**
   * Vérifie si workflow existe
   */
  public hasWorkflow(workflowId: string): boolean {
    return this.workflows.has(workflowId)
  }

  /**
   * Désenregistre workflow
   */
  public unregister(workflowId: string): boolean {
    const removed = this.workflows.delete(workflowId)
    if (removed) {
      logger.info(`Workflow unregistered: ${workflowId}`)
    }
    return removed
  }

  /**
   * Valide définition workflow
   */
  private validateDefinition(definition: WorkflowDefinition): { valid: boolean; error?: string } {
    // ID requis
    if (!definition.id || typeof definition.id !== 'string') {
      return { valid: false, error: 'Workflow ID is required and must be string' }
    }

    // Nom requis
    if (!definition.name || typeof definition.name !== 'string') {
      return { valid: false, error: 'Workflow name is required and must be string' }
    }

    // StartStep requis
    if (!definition.startStep || typeof definition.startStep !== 'string') {
      return { valid: false, error: 'Workflow startStep is required and must be string' }
    }

    // Steps requis
    if (!definition.steps || typeof definition.steps !== 'object') {
      return { valid: false, error: 'Workflow steps are required and must be object' }
    }

    // StartStep doit exister dans steps
    if (!definition.steps[definition.startStep]) {
      return { valid: false, error: `StartStep '${definition.startStep}' not found in steps` }
    }

    // Valider chaque étape
    for (const [stepId, stepDef] of Object.entries(definition.steps)) {
      if (!stepDef.id || !stepDef.type) {
        return { valid: false, error: `Step '${stepId}' missing required id or type` }
      }
    }

    return { valid: true }
  }

  /**
   * Statistiques du registre
   */
  public getStats(): {
    totalWorkflows: number
    workflowsByStepCount: Record<string, number>
    oldestWorkflow?: string
    newestWorkflow?: string
  } {
    const workflows = Array.from(this.workflows.values())

    const stepCounts: Record<string, number> = {}
    let oldest: WorkflowMetadata | undefined
    let newest: WorkflowMetadata | undefined

    for (const workflow of workflows) {
      const stepCount = Object.keys(workflow.definition.steps).length
      const range = stepCount <= 3 ? 'simple' : stepCount <= 6 ? 'medium' : 'complex'
      stepCounts[range] = (stepCounts[range] || 0) + 1

      if (!oldest || workflow.registeredAt < oldest.registeredAt) {
        oldest = workflow
      }
      if (!newest || workflow.registeredAt > newest.registeredAt) {
        newest = workflow
      }
    }

    return {
      totalWorkflows: workflows.length,
      workflowsByStepCount: stepCounts,
      oldestWorkflow: oldest?.definition.id,
      newestWorkflow: newest?.definition.id,
    }
  }
}
