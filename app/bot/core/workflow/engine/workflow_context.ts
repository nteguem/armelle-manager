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
 * Résultat d'exécution d'une étape
 */
export interface StepResult {
  // Type d'action à effectuer
  action: 'send_message' | 'call_service' | 'complete_workflow' | 'validation_error' | 'transition'

  // Message à afficher (clé i18n)
  messageKey?: string

  // Contenu direct du message
  content?: string

  // Options de menu si applicable
  menuOptions?: MenuOption[]

  // Prochaine étape
  nextStep?: string

  // Données à sauvegarder
  saveData?: Record<string, any>

  // Appel de service si applicable
  serviceCall?: {
    service: string
    method: string
    params: Record<string, any>
  }

  //Clé de sauvegarde pour le résultat de service
  saveAs?: string

  // Message d'erreur
  error?: string

  // Traitement automatique de l'étape suivante
  shouldProcessNext?: boolean
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
    headerPrefix?: string
    completionMessage?: string
  }
}
