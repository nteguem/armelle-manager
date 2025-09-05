import type { WorkflowDefinition, WorkflowStep } from '../../../types/workflow_types.js'

/**
 * Classe de base pour tous les workflows
 * Permet de définir un workflow de manière déclarative
 */
export abstract class BaseWorkflow {
  protected definition: WorkflowDefinition

  constructor() {
    this.definition = this.define()
    this.validateDefinition()
  }

  /**
   * Méthode à implémenter pour définir le workflow
   */
  abstract define(): WorkflowDefinition

  /**
   * Récupère la définition complète
   */
  getDefinition(): WorkflowDefinition {
    return this.definition
  }

  /**
   * Récupère une étape par son ID
   */
  getStep(stepId: string): WorkflowStep | undefined {
    return this.definition.steps.find((step) => step.id === stepId)
  }

  /**
   * Récupère une étape par son index
   */
  getStepByIndex(index: number): WorkflowStep | undefined {
    return this.definition.steps[index]
  }

  /**
   * Trouve l'index d'une étape par son ID
   */
  getStepIndex(stepId: string): number {
    return this.definition.steps.findIndex((step) => step.id === stepId)
  }

  /**
   * Validation basique de la définition
   */
  private validateDefinition(): void {
    if (!this.definition.id) {
      throw new Error('Workflow must have an ID')
    }

    if (!this.definition.steps || this.definition.steps.length === 0) {
      throw new Error(`Workflow ${this.definition.id} must have at least one step`)
    }

    // Vérifier que chaque étape a un ID unique
    const stepIds = new Set<string>()
    for (const step of this.definition.steps) {
      if (!step.id) {
        throw new Error(`Step in workflow ${this.definition.id} must have an ID`)
      }
      if (stepIds.has(step.id)) {
        throw new Error(`Duplicate step ID: ${step.id} in workflow ${this.definition.id}`)
      }
      stepIds.add(step.id)
    }
  }
}
