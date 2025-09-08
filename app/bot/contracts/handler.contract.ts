// app/bot/contracts/handler.contract.ts

import type { StateContext } from '#bot/types/state.types'
import type { SessionContext } from '#bot/types/bot_types'

/**
 * Résultat du traitement par un handler
 */
export interface HandlerResult {
  success: boolean

  // Message à envoyer à l'utilisateur
  message?: string

  // Prochain état suggéré (le StateController décidera)
  nextState?: string

  // Données à passer au contexte d'état
  stateData?: any

  // Indique si le handler a complété son travail
  completed?: boolean

  // Erreur si échec
  error?: string
}

/**
 * Contrat pour tous les handlers
 */
export interface Handler {
  /**
   * Nom unique du handler
   */
  readonly name: string

  /**
   * États supportés par ce handler
   */
  readonly supportedStates: string[]

  /**
   * Vérifie si le handler peut traiter cette requête
   */
  canHandle(context: StateContext, input: string): boolean

  /**
   * Traite la requête
   */
  handle(context: StateContext, input: string): Promise<HandlerResult>

  /**
   * Nettoyage si nécessaire (appelé quand on quitte l'état)
   */
  cleanup?(context: StateContext): Promise<void>
}

/**
 * Handler avec capacité de validation d'input
 */
export interface ValidatingHandler extends Handler {
  /**
   * Valide l'input avant traitement
   */
  validate(input: string, context: StateContext): ValidationResult
}

/**
 * Résultat de validation
 */
export interface ValidationResult {
  valid: boolean
  error?: string
  sanitizedInput?: string
}

/**
 * Handler avec menu
 */
export interface MenuHandler extends Handler {
  /**
   * Construit les options du menu
   */
  buildMenuOptions(context: StateContext): MenuOption[]

  /**
   * Traite une sélection de menu
   */
  handleSelection(selection: number | string, context: StateContext): Promise<HandlerResult>
}

/**
 * Option de menu
 */
export interface MenuOption {
  id: string
  label: string | ((language: string) => string)
  value: any
  visible?: boolean | ((context: SessionContext) => boolean)
  enabled?: boolean | ((context: SessionContext) => boolean)
}

/**
 * Handler avec workflow
 */
export interface WorkflowHandler extends Handler {
  /**
   * Démarre un workflow
   */
  startWorkflow(workflowId: string, context: StateContext): Promise<HandlerResult>

  /**
   * Continue l'exécution du workflow
   */
  continueWorkflow(input: string, context: StateContext): Promise<HandlerResult>

  /**
   * Annule le workflow en cours
   */
  cancelWorkflow(context: StateContext): Promise<HandlerResult>
}

/**
 * Priorité d'exécution des handlers
 */
export enum HandlerPriority {
  CRITICAL = 100, // Handlers système critiques
  HIGH = 75, // Commandes système
  NORMAL = 50, // Handlers normaux
  LOW = 25, // Handlers de fallback
}

/**
 * Metadata du handler pour l'enregistrement
 */
export interface HandlerMetadata {
  name: string
  priority?: HandlerPriority
  description?: string
  version?: string
}
