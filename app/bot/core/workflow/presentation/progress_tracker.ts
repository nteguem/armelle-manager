// app/bot/core/workflow/presentation/progress_tracker.ts

/**
 * Information de progression d'étape
 */
export interface StepProgress {
  current: number
  total: number
  prefix: string
  stepName?: string
}

/**
 * Configuration progression workflow
 */
interface WorkflowProgressConfig {
  totalSteps: number
  prefix: string
  steps: Record<string, number>
}

/**
 * Gestionnaire progression des workflows
 */
export class ProgressTracker {
  private static instance: ProgressTracker
  private progressConfigs: Map<string, WorkflowProgressConfig> = new Map()

  private constructor() {
    this.initializeDefaultConfigs()
  }

  public static getInstance(): ProgressTracker {
    if (!ProgressTracker.instance) {
      ProgressTracker.instance = new ProgressTracker()
    }
    return ProgressTracker.instance
  }

  /**
   * Initialise configurations par défaut
   */
  private initializeDefaultConfigs(): void {
    // Configuration onboarding
    this.progressConfigs.set('onboarding', {
      totalSteps: 3,
      prefix: 'Inscription',
      steps: {
        collect_name: 1,
        search_dgi: 2,
        confirm_single: 3,
        select_multiple: 3,
        async_link_taxpayer: 3,
        complete_with_taxpayer: 3,
        complete_name_only: 3,
      },
    })

    // Configuration calcul IGS (exemple futur)
    this.progressConfigs.set('calcul_igs', {
      totalSteps: 4,
      prefix: 'Calcul IGS',
      steps: {
        collect_revenus: 1,
        select_statut: 2,
        calculate_igs: 3,
        display_result: 4,
      },
    })
  }

  /**
   * Enregistre configuration progression pour workflow
   */
  public registerWorkflowProgress(
    workflowId: string,
    config: {
      totalSteps: number
      prefix: string
      stepMapping: Record<string, number>
    }
  ): void {
    this.progressConfigs.set(workflowId, {
      totalSteps: config.totalSteps,
      prefix: config.prefix,
      steps: config.stepMapping,
    })
  }

  /**
   * Récupère progression d'une étape
   */
  public getProgress(workflowId: string, stepId: string): StepProgress | null {
    const config = this.progressConfigs.get(workflowId)
    if (!config) {
      return null
    }

    const currentStep = config.steps[stepId]
    if (!currentStep) {
      return null
    }

    return {
      current: currentStep,
      total: config.totalSteps,
      prefix: config.prefix,
      stepName: stepId,
    }
  }

  /**
   * Calcule pourcentage progression
   */
  public getProgressPercentage(workflowId: string, stepId: string): number {
    const progress = this.getProgress(workflowId, stepId)
    if (!progress) {
      return 0
    }

    return Math.round((progress.current / progress.total) * 100)
  }

  /**
   * Vérifie si étape est la dernière
   */
  public isLastStep(workflowId: string, stepId: string): boolean {
    const progress = this.getProgress(workflowId, stepId)
    return progress ? progress.current === progress.total : false
  }

  /**
   * Vérifie si étape est la première
   */
  public isFirstStep(workflowId: string, stepId: string): boolean {
    const progress = this.getProgress(workflowId, stepId)
    return progress ? progress.current === 1 : false
  }

  /**
   * Récupère étape suivante théorique
   */
  public getNextStepNumber(workflowId: string, stepId: string): number | null {
    const progress = this.getProgress(workflowId, stepId)
    if (!progress || progress.current >= progress.total) {
      return null
    }

    return progress.current + 1
  }

  /**
   * Récupère étape précédente théorique
   */
  public getPreviousStepNumber(workflowId: string, stepId: string): number | null {
    const progress = this.getProgress(workflowId, stepId)
    if (!progress || progress.current <= 1) {
      return null
    }

    return progress.current - 1
  }

  /**
   * Liste toutes les étapes d'un workflow avec leur numéro
   */
  public getWorkflowStepsMapping(workflowId: string): Record<string, number> | null {
    const config = this.progressConfigs.get(workflowId)
    return config ? { ...config.steps } : null
  }

  /**
   * Trouve ID étape par numéro
   */
  public getStepIdByNumber(workflowId: string, stepNumber: number): string | null {
    const config = this.progressConfigs.get(workflowId)
    if (!config) {
      return null
    }

    for (const [stepId, number] of Object.entries(config.steps)) {
      if (number === stepNumber) {
        return stepId
      }
    }

    return null
  }
}
