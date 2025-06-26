/**
 * Types TypeScript stricts pour le système bot
 */

/**
 * Canaux de messagerie supportés
 */
export type MessageChannel = 'whatsapp'

/**
 * Langues supportées
 */
export type SupportedLanguage = 'fr' | 'en'

/**
 * Direction des messages
 */
export type MessageDirection = 'in' | 'out'

/**
 * Types de messages
 */
export type MessageType = 'text' | 'command' | 'media' | 'location'

/**
 * Statuts de session
 */
export type SessionStatus = 'active' | 'expired' | 'suspended'

/**
 * Statuts de workflow
 */
export type WorkflowStatus = 'active' | 'paused' | 'completed' | 'abandoned' | 'error'

/**
 * Structure d'un message entrant
 */
export interface IncomingMessage {
  readonly channel: MessageChannel
  readonly channelUserId: string
  readonly content: string
  readonly rawData: Record<string, any>
  readonly messageType: MessageType
  readonly timestamp: Date
}

/**
 * Structure d'un message sortant
 */
export interface OutgoingMessage {
  readonly to: string
  readonly content: string
  readonly structuredContent?: Record<string, any>
  readonly language: SupportedLanguage
  readonly messageType: MessageType
}

/**
 * Frame de navigation dans la pile
 */
export interface NavigationFrame {
  readonly workflowId: string
  readonly stepId: string
  readonly timestamp: number
  readonly context: Record<string, any>
  readonly canReturn: boolean
}

/**
 * Historique des workflows
 */
export interface WorkflowHistory {
  readonly completed: readonly string[]
  readonly abandoned: readonly string[]
  readonly currentPath: readonly string[]
  readonly totalWorkflows: number
}

/**
 * Workflow actif
 */
export interface ActiveWorkflow {
  readonly id: string
  readonly status: WorkflowStatus
  readonly currentStep: string
  readonly priority: number
  readonly startedAt: Date
  readonly lastActivityAt: Date
}

/**
 * Contexte de session complet
 */
export interface SessionContext {
  readonly current: Record<string, any>
  readonly persistent: Record<string, any>
  readonly navigationStack: readonly NavigationFrame[]
  readonly workflowHistory: WorkflowHistory
  readonly activeWorkflows: readonly ActiveWorkflow[]
}

/**
 * Commande système
 */
export interface SystemCommand {
  readonly name: string
  readonly synonyms: readonly string[]
  readonly restricted: boolean
  readonly priority: number
}

/**
 * Résultat de traitement de message
 */
export interface MessageProcessingResult {
  readonly success: boolean
  readonly response?: string
  readonly error?: string
  readonly sessionUpdated: boolean
  readonly processingTimeMs: number
}

/**
 * Événement Socket.IO QR
 */
export interface QRSocketEvent {
  readonly type: 'update' | 'expired' | 'success' | 'clear'
  readonly data?: string
  readonly timestamp: Date
}

/**
 * Configuration d'adapter de canal
 */
export interface ChannelAdapterConfig {
  readonly channel: MessageChannel
  readonly enabled: boolean
  readonly settings: Record<string, any>
}

/**
 * Interface pour tous les adapters de canaux
 */
export interface ChannelAdapter {
  readonly channel: MessageChannel
  start(): Promise<void>
  stop(): Promise<void>
  sendMessage(message: OutgoingMessage): Promise<void>
  isConnected(): boolean
}

/**
 * Interface pour le moteur de workflow
 */
export interface WorkflowEngine {
  processMessage(message: IncomingMessage): Promise<MessageProcessingResult>
  startWorkflow(workflowId: string, userId: string): Promise<void>
  pauseWorkflow(workflowId: string, userId: string): Promise<void>
  resumeWorkflow(workflowId: string, userId: string): Promise<void>
  cancelWorkflow(workflowId: string, userId: string): Promise<void>
}

/**
 * Interface pour le gestionnaire de contexte
 */
export interface ContextManager {
  getSession(channel: MessageChannel, channelUserId: string): Promise<SessionContext | null>
  createSession(channel: MessageChannel, channelUserId: string): Promise<SessionContext>
  updateSession(sessionId: string, updates: Partial<SessionContext>): Promise<void>
  expireSession(sessionId: string): Promise<void>
}

/**
 * Interface pour le constructeur de messages
 */
export interface MessageBuilder {
  build(options: MessageBuildOptions): string
}

/**
 * Options pour construire un message
 */
export interface MessageBuildOptions {
  readonly content: string
  readonly subheader?: string
  readonly footer?: string
  readonly language: SupportedLanguage
  readonly params?: Record<string, any>
}

/**
 * Événement du système bot
 */
export interface BotEvent {
  readonly type: string
  readonly payload: Record<string, any>
  readonly timestamp: Date
  readonly source: string
}
