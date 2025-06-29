import BotSession from '#models/bot_session'

// ===== MESSAGES & COMMUNICATION =====

export interface IncomingMessage {
  channel: string
  channelUserId: string
  content: string
  messageType: 'text' | 'image' | 'audio' | 'document'
  timestamp: Date
  rawData: Record<string, any>
}

export interface OutgoingMessage {
  to: string
  content: string
  messageType?: string
  structuredContent?: Record<string, any>
}

export interface MessageOptions {
  content: string
  subheader?: string
  footer?: string
  language: SupportedLanguage
  params?: Record<string, any>
}

// ===== LANGUES =====

export type SupportedLanguage = 'fr' | 'en'

// ===== WORKFLOW SYSTEM =====

export interface WorkflowStep {
  id: string
  type: 'input' | 'menu' | 'display' | 'api'
  messageKey: string
  subheaderKey?: string // Clé pour le subheader (optionnel)
  footerKey?: string // Clé pour le footer (optionnel)

  // Validation
  validation?: ValidationRule

  // Navigation
  transitions: Record<string, string>
  allowSystemCommands?: boolean // Défaut: true

  // Workflow context
  action?: string
  subflowId?: string
  progressMode?: 'auto' | 'none' // auto = calcul automatique, none = pas d'affichage

  // Données dynamiques
  dynamicTransitions?: boolean // Les transitions dépendent du résultat d'action
}

export interface SubFlow {
  id: string
  nameKey: string // Clé i18n pour le nom du sous-flow
  steps: string[] // IDs des étapes de ce sous-flow
  totalSteps: number // Nombre total d'étapes
}

export interface WorkflowDefinition {
  id: string
  initialStep: string
  steps: Record<string, WorkflowStep>
  subflows: Record<string, SubFlow>

  // Menu principal
  menuTitleKey: string
  menuOrder: number

  // Permissions
  requiresVerification?: boolean
  requiresTaxpayer?: boolean
}

// ===== VALIDATION =====

export interface ValidationRule {
  type: 'name' | 'niu' | 'phone' | 'amount' | 'menu_choice' | 'custom'
  required?: boolean
  min?: number
  max?: number
  pattern?: RegExp
  allowedValues?: string[] // Pour les choix de menu
  customValidator?: string // Nom de la fonction de validation custom
}

export interface ValidationResult {
  valid: boolean
  error?: string
  sanitizedValue?: any
}

// ===== ACTIONS & TRANSITIONS =====

export interface ActionResult {
  success: boolean
  data?: Record<string, any>
  transition?: string // Transition spécifique à utiliser
  error?: string
}

export type WorkflowAction = (session: BotSession, input?: IncomingMessage) => Promise<ActionResult>

export type TransitionResolver = (context: Record<string, any>) => string

// ===== NAVIGATION =====

export interface NavigationState {
  workflow: string | null
  step: string | null
  subflow: string | null
  subflowPosition: number
  context: Record<string, any>
  timestamp: string
}

export interface ProgressInfo {
  current: number
  total: number
  subflowName?: string // Nom du sous-flow actuel
}

// ===== COMMANDES SYSTÈME =====

export interface SystemCommand {
  id: string
  aliases: string[]
  execute: (session: BotSession, input?: string) => Promise<void>
  blockedInOnboarding?: boolean // true = bloqué pendant onboarding
  description?: string
}

export interface CommandResult {
  handled: boolean
  requiresResponse?: boolean
}

// ===== ADAPTERS =====

export type MessageChannel = 'whatsapp' | 'telegram' | 'web'

export interface ChannelAdapter {
  readonly channel: MessageChannel
  start(): Promise<void>
  stop(): Promise<void>
  sendMessage(message: OutgoingMessage): Promise<void>
  isConnected(): boolean
  setCallbacks(callbacks: AdapterCallbacks): void
}

export interface AdapterCallbacks {
  onMessageReceived?: (message: IncomingMessage) => Promise<void>
  onConnectionStatusChanged?: (connected: boolean) => void
}

// ===== SERVICES =====

export interface SearchResult {
  niu: string
  nom: string
  prenom?: string
  centre?: string
  numeroDocument?: string
  activite?: string
  regime?: string
}

export interface VerifyResult {
  niu: string
  nom: string
  prenom?: string
  numeroDocument?: string
  activite?: string
  regime?: string
  etat?: string
}

export interface ScraperResponse<T> {
  success: boolean
  message: string
  data: T | null
  type?: 'aucune' | 'unique' | 'multiple' | 'erreur'
}

// ===== WORKFLOW ENGINE =====

export interface WorkflowEngineConfig {
  defaultLanguage: SupportedLanguage
  maxNavigationStackSize: number
  sessionTimeoutMinutes: number
}

export interface WorkflowExecutionContext {
  session: BotSession
  currentStep: WorkflowStep
  workflow: any // BaseWorkflow instance
  input?: IncomingMessage
}

// ===== UTILITAIRES =====

export interface KeyValuePair {
  key: string
  value: any
}

export interface MenuOption {
  id: string
  labelKey: string
  value?: any
}

// ===== TYPES POUR LES MODÈLES (extension) =====

export interface BotSessionExtended extends BotSession {
  currentSubflow?: string | null
  subflowPosition?: number
}

// ===== MESSAGES D'ERREUR =====

export interface ErrorContext {
  workflowId?: string
  stepId?: string
  validationType?: string
  userInput?: string
}
