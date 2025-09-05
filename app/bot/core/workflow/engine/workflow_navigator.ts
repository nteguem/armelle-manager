// app/bot/core/workflow/engine/workflow_navigator.ts

import type { WorkflowContext, WorkflowStep } from '../../../types/workflow_types.js'
import type { BaseWorkflow } from '../definitions/base_workflow.js'

/**
 * Gère la navigation dans un workflow (avant/arrière)
 */
export default class WorkflowNavigator {
  private workflow: BaseWorkflow
  private context: WorkflowContext

  constructor(workflow: BaseWorkflow, context: WorkflowContext) {
    this.workflow = workflow
    this.context = context
  }

  /**
   * Obtient l'étape courante
   */
  getCurrentStep(): WorkflowStep | null {
    return this.workflow.getStepByIndex(this.context.currentStepIndex) || null
  }

  /**
   * Passe à l'étape suivante
   */
  moveNext(currentStepId: string): WorkflowStep | null {
    const currentStep = this.workflow.getStep(currentStepId)
    if (!currentStep) return null

    // Si nextStep est défini, aller à cette étape
    if (currentStep.nextStep) {
      const nextIndex = this.workflow.getStepIndex(currentStep.nextStep)
      if (nextIndex !== -1) {
        this.context.currentStepIndex = nextIndex
        this.context.history.push(currentStep.nextStep)
        return this.workflow.getStepByIndex(nextIndex) || null
      }
    }

    // Sinon, aller à l'étape suivante dans l'ordre
    const nextIndex = this.context.currentStepIndex + 1
    const nextStep = this.workflow.getStepByIndex(nextIndex)

    if (nextStep) {
      this.context.currentStepIndex = nextIndex
      this.context.history.push(nextStep.id)
      return nextStep
    }

    return null // Fin du workflow
  }

  /**
   * Retourne à l'étape précédente
   */
  moveBack(): WorkflowStep | null {
    // Vérifier s'il y a un historique
    if (this.context.history.length <= 1) {
      return null // Pas d'étape précédente
    }

    // Retirer l'étape actuelle de l'historique
    this.context.history.pop()

    // Récupérer l'étape précédente
    const previousStepId = this.context.history[this.context.history.length - 1]
    const previousIndex = this.workflow.getStepIndex(previousStepId)

    if (previousIndex !== -1) {
      this.context.currentStepIndex = previousIndex
      return this.workflow.getStepByIndex(previousIndex) || null
    }

    return null
  }

  /**
   * Vérifie si on peut reculer
   */
  canGoBack(): boolean {
    const currentStep = this.getCurrentStep()
    if (!currentStep) return false

    // Vérifier la config de l'étape (par défaut true)
    const stepAllowsBack = currentStep.canGoBack !== false

    // Vérifier qu'on a un historique
    const hasHistory = this.context.history.length > 1

    return stepAllowsBack && hasHistory
  }

  /**
   * Vérifie si c'est la dernière étape
   */
  isLastStep(): boolean {
    const totalSteps = this.workflow.getDefinition().steps.length
    return this.context.currentStepIndex >= totalSteps - 1
  }

  /**
   * Aller directement à une étape spécifique (pour les choices)
   */
  goToStep(stepId: string): WorkflowStep | null {
    const stepIndex = this.workflow.getStepIndex(stepId)

    if (stepIndex !== -1) {
      this.context.currentStepIndex = stepIndex
      this.context.history.push(stepId)
      return this.workflow.getStepByIndex(stepIndex) || null
    }

    return null
  }
}
