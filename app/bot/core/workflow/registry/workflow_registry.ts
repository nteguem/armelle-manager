import type { WorkflowDefinition } from '../engine/workflow_context.js'
import { WorkflowEngine } from '../engine/workflow_engine.js'
import { WorkflowProgressConfigs } from '#config/workflows'
import logger from '@adonisjs/core/services/logger'

interface WorkflowMetadata {
  definition: WorkflowDefinition
  registeredAt: Date
  version?: string
  description?: string
}

export class WorkflowRegistry {
  private static instance: WorkflowRegistry
  private workflows: Map<string, WorkflowMetadata> = new Map()
  private engine: WorkflowEngine

  private constructor() {
    this.engine = WorkflowEngine.getInstance()
  }

  public static getInstance(): WorkflowRegistry {
    if (!WorkflowRegistry.instance) {
      WorkflowRegistry.instance = new WorkflowRegistry()
    }
    return WorkflowRegistry.instance
  }

  public register(
    definition: WorkflowDefinition,
    options: {
      version?: string
      description?: string
      progressConfig?: any // Ignoré - utilise config externe
    } = {}
  ): void {
    const validation = this.validateDefinition(definition)
    if (!validation.valid) {
      throw new Error(`Invalid workflow definition for ${definition.id}: ${validation.error}`)
    }

    this.workflows.set(definition.id, {
      definition,
      registeredAt: new Date(),
      version: options.version,
      description: options.description,
    })

    this.engine.registerWorkflow(definition)

    // Vérifier si config de progression existe
    const progressConfig = WorkflowProgressConfigs[definition.id]
    if (progressConfig) {
      logger.info(`Workflow registered with progress config: ${definition.id}`)
    } else {
      logger.warn(`No progress config found for workflow: ${definition.id}`)
    }

    logger.info(`Workflow registered: ${definition.id}`, {
      version: options.version,
      stepsCount: Object.keys(definition.steps).length,
    })
  }

  public getWorkflowMetadata(workflowId: string): WorkflowMetadata | undefined {
    return this.workflows.get(workflowId)
  }

  public getWorkflowDefinition(workflowId: string): WorkflowDefinition | undefined {
    const metadata = this.workflows.get(workflowId)
    return metadata?.definition
  }

  public listWorkflows(): {
    id: string
    name: string
    version?: string
    description?: string
    stepsCount: number
    registeredAt: Date
    hasProgressConfig: boolean
  }[] {
    return Array.from(this.workflows.entries()).map(([id, metadata]) => ({
      id,
      name: metadata.definition.name,
      version: metadata.version,
      description: metadata.description,
      stepsCount: Object.keys(metadata.definition.steps).length,
      registeredAt: metadata.registeredAt,
      hasProgressConfig: !!WorkflowProgressConfigs[id],
    }))
  }

  public hasWorkflow(workflowId: string): boolean {
    return this.workflows.has(workflowId)
  }

  public unregister(workflowId: string): boolean {
    const removed = this.workflows.delete(workflowId)
    if (removed) {
      logger.info(`Workflow unregistered: ${workflowId}`)
    }
    return removed
  }

  private validateDefinition(definition: WorkflowDefinition): { valid: boolean; error?: string } {
    if (!definition.id || typeof definition.id !== 'string') {
      return { valid: false, error: 'Workflow ID is required and must be string' }
    }

    if (!definition.name || typeof definition.name !== 'string') {
      return { valid: false, error: 'Workflow name is required and must be string' }
    }

    if (!definition.startStep || typeof definition.startStep !== 'string') {
      return { valid: false, error: 'Workflow startStep is required and must be string' }
    }

    if (!definition.steps || typeof definition.steps !== 'object') {
      return { valid: false, error: 'Workflow steps are required and must be object' }
    }

    if (!definition.steps[definition.startStep]) {
      return { valid: false, error: `StartStep '${definition.startStep}' not found in steps` }
    }

    for (const [stepId, stepDef] of Object.entries(definition.steps)) {
      if (!stepDef.id || !stepDef.type) {
        return { valid: false, error: `Step '${stepId}' missing required id or type` }
      }
    }

    return { valid: true }
  }

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
