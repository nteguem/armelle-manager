import type { SessionContext, SupportedLanguage } from '#bot/types/bot_types'

/**
 * Types de workflow
 */
export enum WorkflowType {
  SYSTEM = 'system', // Workflows système (onboarding, etc.)
  USER = 'user', // Workflows utilisateur (IGS, déclaration, etc.)
}

/**
 * Priorité des workflows
 */
export enum WorkflowPriority {
  CRITICAL = 100, // Bloque tout (ex: onboarding)
  HIGH = 75,
  NORMAL = 50,
  LOW = 25,
}

/**
 * État du workflow
 */
export interface WorkflowState {
  workflowId: string
  currentStepId: string
  data: Record<string, any>
  history: string[]
  startedAt: Date
  lastActivity: Date
}

/**
 * Définition d'un step
 */
export interface WorkflowStep {
  id: string
  type: 'input' | 'choice' | 'message' | 'service' | 'condition'

  // Prompt ou message (clé i18n ou fonction)
  prompt?: string | ((context: WorkflowContext) => string)

  // Validation pour input
  validation?: {
    required?: boolean
    type?: 'text' | 'number' | 'email' | 'phone'
    min?: number
    max?: number
    pattern?: RegExp
    custom?: (value: any, context: WorkflowContext) => boolean | string
  }

  // Options pour choice
  choices?: WorkflowChoice[] | ((context: WorkflowContext) => WorkflowChoice[])

  // Service à exécuter
  service?: {
    name: string
    method: string
    params?: (context: WorkflowContext) => Record<string, any>
  }

  // Navigation
  next?: string | ((context: WorkflowContext) => string | null)
  canGoBack?: boolean

  // Condition pour skip
  skipIf?: (context: WorkflowContext) => boolean
}

/**
 * Choix dans un step
 */
export interface WorkflowChoice {
  id: string
  label: string | ((language: SupportedLanguage) => string)
  value: any
  next?: string
}

/**
 * Contexte du workflow
 */
export interface WorkflowContext {
  workflowId: string
  session: SessionContext
  state: WorkflowState

  // Méthodes utilitaires
  get(key: string): any
  set(key: string, value: any): void
  has(key: string): boolean
}

/**
 * Résultat d'exécution d'un step
 */
export interface StepResult {
  success: boolean

  // Prochain step ou null si fin
  nextStepId?: string | null

  // Message à afficher
  message?: string

  // Données à sauvegarder
  data?: any

  // Si le workflow est terminé
  completed?: boolean

  // Erreur
  error?: string
}

/**
 * Définition complète d'un workflow
 */
export interface WorkflowDefinition {
  id: string
  type: WorkflowType
  priority: WorkflowPriority

  // Metadata
  name: string | ((language: SupportedLanguage) => string)
  description?: string | ((language: SupportedLanguage) => string)
  version: string

  // Steps
  steps: WorkflowStep[]

  // Configuration
  config?: {
    allowInterruption?: boolean // Peut être interrompu
    saveProgress?: boolean // Sauvegarder progression
    timeout?: number // Timeout en ms
    maxRetries?: number // Tentatives max
  }

  // Hooks lifecycle
  hooks?: {
    onStart?: (context: WorkflowContext) => Promise<void>
    onComplete?: (context: WorkflowContext) => Promise<void>
    onCancel?: (context: WorkflowContext) => Promise<void>
    onError?: (error: Error, context: WorkflowContext) => Promise<void>
    onStepComplete?: (stepId: string, context: WorkflowContext) => Promise<void>
  }

  // Conditions d'activation
  activation?: {
    commands?: string[]
    keywords?: string[]
    condition?: (session: SessionContext) => boolean
  }
}

/**
 * Contrat pour un workflow
 */
export interface Workflow {
  /**
   * Obtient la définition
   */
  getDefinition(): WorkflowDefinition

  /**
   * Obtient un step par ID
   */
  getStep(stepId: string): WorkflowStep | undefined

  /**
   * Vérifie si le workflow peut être activé
   */
  canActivate(session: SessionContext): boolean

  /**
   * Initialise le workflow
   */
  initialize(context: WorkflowContext): Promise<void>

  /**
   * Exécute un step
   */
  executeStep(stepId: string, input: string, context: WorkflowContext): Promise<StepResult>

  /**
   * Valide l'input pour un step
   */
  validateInput(stepId: string, input: string, context: WorkflowContext): ValidationResult

  /**
   * Obtient le prochain step
   */
  getNextStep(currentStepId: string, context: WorkflowContext): string | null
}

/**
 * Résultat de validation
 */
export interface ValidationResult {
  valid: boolean
  error?: string
  sanitized?: any
}

/**
 * Service utilisable dans les workflows
 */
export interface WorkflowService {
  name: string

  /**
   * Exécute une méthode du service
   */
  execute(method: string, params: Record<string, any>, context: WorkflowContext): Promise<any>

  /**
   * Vérifie si le service est disponible
   */
  isAvailable(): boolean
}
