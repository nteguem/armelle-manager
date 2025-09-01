import type { SessionContext } from '#bot/types/bot_types'

/**
 * Contexte d'exécution d'un workflow
 * Encapsule toutes les données nécessaires à l'exécution
 */
export interface WorkflowContext {
  // Identifiant workflow
  workflowId: string

  // Étape courante
  currentStep: string

  // Session utilisateur (existante)
  session: SessionContext

  // Variables du workflow (données collectées/calculées)
  variables: Record<string, any>

  // Métadonnées d'exécution
  execution: {
    startedAt: Date
    stepStartedAt: Date
    retryCount: number
  }
}

/**
 * Option de menu
 */
export interface MenuOption {
  id: string
  label: string
  value: any
}

/**
 * Appel de service structuré
 */
export interface ServiceCall {
  service: string
  method: string
  params: Record<string, any>
}

/**
 * Résultat d'envoi de message
 */
export interface MessageResult {
  action: 'send_message'
  messageKey?: string
  content?: string
  menuOptions?: MenuOption[]
  nextStep?: string
  saveData?: Record<string, any>
  shouldProcessNext?: boolean
}

/**
 * Résultat d'appel de service
 */
export interface ServiceResult {
  action: 'call_service'
  serviceCall: ServiceCall
  saveAs?: string
  messageKey?: string // Message de progression optionnel
  saveData?: Record<string, any>
}

/**
 * Résultat de transition
 */
export interface TransitionResult {
  action: 'transition'
  nextStep?: string
  saveData?: Record<string, any>
  shouldProcessNext?: boolean
}

/**
 * Résultat de completion de workflow
 */
export interface WorkflowCompleteResult {
  action: 'complete_workflow'
  messageKey?: string
  finalData?: Record<string, any>
}

/**
 * Résultat d'erreur de validation
 */
export interface ValidationErrorResult {
  action: 'validation_error'
  error: string
  messageKey?: string // Pour réafficher le prompt
  content?: string
  retryStep?: string
}

/**
 * Union type pour tous les résultats possibles
 * Chaque type d'action a son interface spécialisée
 */
export type StepResult =
  | MessageResult
  | ServiceResult
  | TransitionResult
  | WorkflowCompleteResult
  | ValidationErrorResult

/**
 * Définition d'une étape de workflow
 */
export interface WorkflowStepDefinition {
  id: string
  type: string
  config: Record<string, any>
  nextStep?: string | ConditionalNext[]
}

/**
 * Transition conditionnelle
 */
export interface ConditionalNext {
  condition: string
  nextStep: string
}

/**
 * Définition complète d'un workflow
 */
export interface WorkflowDefinition {
  id: string
  name: string
  startStep: string
  steps: Record<string, WorkflowStepDefinition>
  metadata?: {
    totalSteps?: number
    category?: string
    description?: string
    version?: string
    headerPrefix?: string
    completionMessage?: string
  }
}

/**
 * Type guards pour identifier les types de résultats
 */
export function isMessageResult(result: StepResult): result is MessageResult {
  return result.action === 'send_message'
}

export function isServiceResult(result: StepResult): result is ServiceResult {
  return result.action === 'call_service'
}

export function isTransitionResult(result: StepResult): result is TransitionResult {
  return result.action === 'transition'
}

export function isWorkflowCompleteResult(result: StepResult): result is WorkflowCompleteResult {
  return result.action === 'complete_workflow'
}

export function isValidationErrorResult(result: StepResult): result is ValidationErrorResult {
  return result.action === 'validation_error'
}

/**
 * Configuration de progression workflow
 */
export interface WorkflowProgressConfig {
  totalSteps: number
  prefix: string
  stepMapping: Record<string, number>
}

/**
 * Information de progression
 */
export interface ProgressInfo {
  current: number
  total: number
  prefix: string
  stepName?: string
}

/**
 * Métadonnées d'exécution étendues
 */
export interface WorkflowExecutionMetadata {
  startedAt: Date
  stepStartedAt: Date
  retryCount: number
  previousStep?: string
  totalStepsExecuted: number
  errorHistory: Array<{
    step: string
    error: string
    timestamp: Date
  }>
}

/**
 * Contexte d'exécution enrichi (pour usages avancés)
 */
export interface EnhancedWorkflowContext extends WorkflowContext {
  execution: WorkflowExecutionMetadata
  stateSnapshot?: Record<string, any> // Sauvegarde état pour rollback
  debugMode?: boolean
}
