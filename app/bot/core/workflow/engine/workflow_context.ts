import type { SessionContext } from '#bot/types/bot_types'
import type { WorkflowContext, WorkflowState } from '#bot/contracts/workflow.contract'

/**
 * Implémentation du contexte de workflow
 * Encapsule l'état et les données du workflow
 */
export class WorkflowContextImpl implements WorkflowContext {
  public readonly workflowId: string
  public readonly session: SessionContext
  public state: WorkflowState

  constructor(workflowId: string, session: SessionContext) {
    this.workflowId = workflowId
    this.session = session

    // Initialiser l'état
    this.state = {
      workflowId,
      currentStepId: '',
      data: {},
      history: [],
      startedAt: new Date(),
      lastActivity: new Date(),
    }
  }

  /**
   * Obtient une valeur du contexte
   */
  get(key: string): any {
    return this.state.data[key]
  }

  /**
   * Définit une valeur dans le contexte
   */
  set(key: string, value: any): void {
    this.state.data[key] = value
    this.state.lastActivity = new Date()
  }

  /**
   * Vérifie si une clé existe
   */
  has(key: string): boolean {
    return key in this.state.data
  }

  /**
   * Obtient plusieurs valeurs
   */
  getMultiple(keys: string[]): Record<string, any> {
    const result: Record<string, any> = {}
    for (const key of keys) {
      if (this.has(key)) {
        result[key] = this.get(key)
      }
    }
    return result
  }

  /**
   * Définit plusieurs valeurs
   */
  setMultiple(values: Record<string, any>): void {
    for (const [key, value] of Object.entries(values)) {
      this.set(key, value)
    }
  }

  /**
   * Supprime une valeur
   */
  delete(key: string): void {
    delete this.state.data[key]
    this.state.lastActivity = new Date()
  }

  /**
   * Vide toutes les données
   */
  clear(): void {
    this.state.data = {}
    this.state.lastActivity = new Date()
  }

  /**
   * Change l'étape courante
   */
  setCurrentStep(stepId: string): void {
    this.state.currentStepId = stepId
    this.state.history.push(stepId)
    this.state.lastActivity = new Date()
  }

  /**
   * Obtient l'étape courante
   */
  getCurrentStep(): string {
    return this.state.currentStepId
  }

  /**
   * Obtient l'historique des étapes
   */
  getHistory(): string[] {
    return [...this.state.history]
  }

  /**
   * Vérifie si on peut revenir en arrière
   */
  canGoBack(): boolean {
    return this.state.history.length > 1
  }

  /**
   * Revient à l'étape précédente
   */
  goBack(): string | null {
    if (!this.canGoBack()) {
      return null
    }

    // Retirer l'étape actuelle
    this.state.history.pop()

    // Obtenir l'étape précédente
    const previousStep = this.state.history[this.state.history.length - 1]
    this.state.currentStepId = previousStep
    this.state.lastActivity = new Date()

    return previousStep
  }

  /**
   * Obtient la durée d'exécution
   */
  getElapsedTime(): number {
    return Date.now() - this.state.startedAt.getTime()
  }

  /**
   * Obtient le temps d'inactivité
   */
  getInactivityTime(): number {
    return Date.now() - this.state.lastActivity.getTime()
  }

  /**
   * Vérifie si le workflow a timeout
   */
  hasTimedOut(timeoutMs: number): boolean {
    return this.getInactivityTime() > timeoutMs
  }

  /**
   * Clone le contexte (pour sauvegarde/restauration)
   */
  clone(): WorkflowContextImpl {
    const cloned = new WorkflowContextImpl(this.workflowId, this.session)
    cloned.state = {
      ...this.state,
      data: { ...this.state.data },
      history: [...this.state.history],
    }
    return cloned
  }

  /**
   * Restaure depuis un état sauvegardé
   */
  restore(state: WorkflowState): void {
    this.state = {
      ...state,
      data: { ...state.data },
      history: [...state.history],
      lastActivity: new Date(),
    }
  }

  /**
   * Obtient un snapshot pour sauvegarde
   */
  toSnapshot(): WorkflowState {
    return {
      workflowId: this.state.workflowId,
      currentStepId: this.state.currentStepId,
      data: { ...this.state.data },
      history: [...this.state.history],
      startedAt: this.state.startedAt,
      lastActivity: this.state.lastActivity,
    }
  }

  /**
   * Obtient un résumé pour debug/log
   */
  getSummary(): Record<string, any> {
    return {
      workflowId: this.workflowId,
      currentStep: this.state.currentStepId,
      stepsCompleted: this.state.history.length,
      dataKeys: Object.keys(this.state.data),
      elapsedTime: this.getElapsedTime(),
      language: this.session.language,
    }
  }
}

/**
 * Factory pour créer des contextes
 */
export class WorkflowContextFactory {
  /**
   * Crée un nouveau contexte
   */
  static create(workflowId: string, session: SessionContext): WorkflowContextImpl {
    return new WorkflowContextImpl(workflowId, session)
  }

  /**
   * Crée depuis un état sauvegardé
   */
  static fromSnapshot(state: WorkflowState, session: SessionContext): WorkflowContextImpl {
    const context = new WorkflowContextImpl(state.workflowId, session)
    context.restore(state)
    return context
  }
}
