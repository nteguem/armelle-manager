import type { SessionContext } from './bot_types.js'

/**
 * États possibles du bot
 */
export enum BotState {
  // États initiaux
  UNVERIFIED = 'unverified', // Nouveau user, doit faire onboarding
  IDLE = 'idle', // User vérifié, attend une action

  // États workflow
  SYSTEM_WORKFLOW = 'system_workflow', // Workflow système actif (onboarding)
  USER_WORKFLOW = 'user_workflow', // Workflow utilisateur actif

  // États IA
  AI_PROCESSING = 'ai_processing', // IA traite la demande
  AI_WAITING_CONFIRM = 'ai_waiting_confirm', // Attend confirmation pour workflow suggéré

  // États menu
  MENU_DISPLAYED = 'menu_displayed', // Menu affiché, attend sélection

  // États d'erreur
  ERROR = 'error', // État d'erreur
}

/**
 * Contexte d'état enrichi
 */
export interface StateContext {
  currentState: BotState
  previousState?: BotState
  session: SessionContext

  // Données spécifiques à l'état
  stateData?: {
    workflowId?: string
    workflowStep?: string
    pendingWorkflow?: string
    menuOptions?: string[]
    error?: string
    lastUserInput?: string
  }

  // Timestamps
  stateEnteredAt: Date
  lastTransition?: Date
}

/**
 * Transition d'état
 */
export interface StateTransition {
  from: BotState
  to: BotState
  trigger: string // Ce qui a causé la transition
  timestamp: Date
  data?: any
}

/**
 * Règles de transition
 */
export const STATE_TRANSITIONS: Record<BotState, BotState[]> = {
  [BotState.UNVERIFIED]: [BotState.SYSTEM_WORKFLOW, BotState.ERROR],

  [BotState.IDLE]: [
    BotState.USER_WORKFLOW,
    BotState.AI_PROCESSING,
    BotState.MENU_DISPLAYED,
    BotState.ERROR,
  ],

  [BotState.SYSTEM_WORKFLOW]: [
    BotState.IDLE, // Workflow complété avec succès
    BotState.UNVERIFIED, // Workflow annulé
    BotState.ERROR,
  ],

  [BotState.USER_WORKFLOW]: [
    BotState.IDLE, // Workflow terminé ou annulé
    BotState.ERROR,
  ],

  [BotState.AI_PROCESSING]: [BotState.IDLE, BotState.AI_WAITING_CONFIRM, BotState.ERROR],

  [BotState.AI_WAITING_CONFIRM]: [
    BotState.USER_WORKFLOW, // Confirmation positive
    BotState.IDLE, // Refus ou timeout
    BotState.AI_PROCESSING, // Continue conversation
  ],

  [BotState.MENU_DISPLAYED]: [
    BotState.USER_WORKFLOW, // Sélection d'un workflow
    BotState.IDLE, // Retour/Annulation
    BotState.ERROR,
  ],

  [BotState.ERROR]: [
    BotState.IDLE, // Récupération
    BotState.UNVERIFIED, // Reset complet si nécessaire
  ],
}

/**
 * Détermine l'état initial basé sur le contexte de session
 */
export function getInitialState(session: SessionContext): BotState {
  if (!session.isVerified) {
    return BotState.UNVERIFIED
  }

  if (session.currentWorkflow) {
    // Déterminer si c'est un workflow système ou user
    if (session.currentWorkflow === 'onboarding') {
      return BotState.SYSTEM_WORKFLOW
    }
    return BotState.USER_WORKFLOW
  }

  return BotState.IDLE
}

/**
 * Vérifie si une transition est valide
 */
export function isValidTransition(from: BotState, to: BotState): boolean {
  const validTransitions: Record<BotState, BotState[]> = {
    [BotState.UNVERIFIED]: [BotState.SYSTEM_WORKFLOW, BotState.IDLE],
    [BotState.SYSTEM_WORKFLOW]: [BotState.IDLE],
    [BotState.IDLE]: [
      BotState.MENU_DISPLAYED,
      BotState.USER_WORKFLOW,
      BotState.AI_PROCESSING,
      BotState.AI_WAITING_CONFIRM, // AJOUT CRITIQUE
    ],
    [BotState.MENU_DISPLAYED]: [BotState.IDLE, BotState.USER_WORKFLOW],
    [BotState.USER_WORKFLOW]: [BotState.IDLE],
    [BotState.AI_PROCESSING]: [BotState.IDLE, BotState.AI_WAITING_CONFIRM],
    [BotState.AI_WAITING_CONFIRM]: [BotState.IDLE, BotState.USER_WORKFLOW],
    [BotState.ERROR]: [BotState.IDLE],
  }

  return validTransitions[from]?.includes(to) || false
}

/**
 * Priorités des états (pour résolution de conflits)
 */
export const STATE_PRIORITY: Record<BotState, number> = {
  [BotState.ERROR]: 10,
  [BotState.SYSTEM_WORKFLOW]: 9,
  [BotState.USER_WORKFLOW]: 7,
  [BotState.AI_WAITING_CONFIRM]: 6,
  [BotState.MENU_DISPLAYED]: 5,
  [BotState.AI_PROCESSING]: 4,
  [BotState.IDLE]: 2,
  [BotState.UNVERIFIED]: 1,
}
