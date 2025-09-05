// app/bot/core/workflow/registry/workflow_registry.ts

import type { BaseWorkflow } from '../definitions/base_workflow.js'

interface WorkflowRegistration {
  workflow: typeof BaseWorkflow
  metadata: {
    version: string
    description?: string
    enabled?: boolean
  }
}

/**
 * Registry central pour tous les workflows disponibles
 */
export class WorkflowRegistry {
  private static instance: WorkflowRegistry
  private workflows: Map<string, WorkflowRegistration> = new Map()

  private constructor() {}

  /**
   * Singleton
   */
  public static getInstance(): WorkflowRegistry {
    if (!WorkflowRegistry.instance) {
      WorkflowRegistry.instance = new WorkflowRegistry()
    }
    return WorkflowRegistry.instance
  }

  /**
   * Enregistre un workflow
   */
  public register(
    WorkflowClass: typeof BaseWorkflow,
    metadata: { version: string; description?: string; enabled?: boolean }
  ): void {
    // Créer une instance temporaire pour récupérer l'ID
    const tempInstance = new (WorkflowClass as any)()
    const definition = tempInstance.getDefinition()
    const workflowId = definition.id

    if (this.workflows.has(workflowId)) {
      console.warn(`Workflow ${workflowId} already registered, overwriting...`)
    }

    this.workflows.set(workflowId, {
      workflow: WorkflowClass,
      metadata: { ...metadata, enabled: metadata.enabled !== false },
    })

    console.log(`✅ Workflow '${workflowId}' v${metadata.version} registered`)
  }

  /**
   * Crée une instance d'un workflow
   */
  public createInstance(workflowId: string): BaseWorkflow | null {
    const registration = this.workflows.get(workflowId)

    if (!registration) {
      console.error(`Workflow ${workflowId} not found`)
      return null
    }

    if (!registration.metadata.enabled) {
      console.warn(`Workflow ${workflowId} is disabled`)
      return null
    }

    const WorkflowClass = registration.workflow as any
    return new WorkflowClass()
  }

  /**
   * Vérifie si un workflow existe et est activé
   */
  public isAvailable(workflowId: string): boolean {
    const registration = this.workflows.get(workflowId)
    return registration ? (registration.metadata.enabled ?? true) : false
  }

  /**
   * Liste tous les workflows disponibles
   */
  public listAvailable(): Array<{ id: string; version: string; description?: string }> {
    const available = []

    for (const [id, registration] of this.workflows) {
      if (registration.metadata.enabled !== false) {
        // Créer une instance pour récupérer l'ID du workflow
        const WorkflowClass = registration.workflow as any
        const instance = new WorkflowClass()
        const definition = instance.getDefinition()

        available.push({
          id: definition.id,
          version: registration.metadata.version,
          description: registration.metadata.description,
        })
      }
    }

    return available
  }

  /**
   * Désactive un workflow
   */
  public disable(workflowId: string): boolean {
    const registration = this.workflows.get(workflowId)
    if (registration) {
      registration.metadata.enabled = false
      return true
    }
    return false
  }

  /**
   * Active un workflow
   */
  public enable(workflowId: string): boolean {
    const registration = this.workflows.get(workflowId)
    if (registration) {
      registration.metadata.enabled = true
      return true
    }
    return false
  }

  /**
   * Vide le registry
   */
  public clear(): void {
    this.workflows.clear()
  }

  /**
   * Stats
   */
  public getStats(): {
    totalWorkflows: number
    enabledWorkflows: number
    disabledWorkflows: number
    workflowIds: string[]
  } {
    let enabled = 0
    let disabled = 0
    const ids: string[] = []

    for (const [id, registration] of this.workflows) {
      ids.push(id)
      if (registration.metadata.enabled !== false) {
        enabled++
      } else {
        disabled++
      }
    }

    return {
      totalWorkflows: this.workflows.size,
      enabledWorkflows: enabled,
      disabledWorkflows: disabled,
      workflowIds: ids,
    }
  }
}
