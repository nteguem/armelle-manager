/**
 * Types existants (conservés)
 */
export type SupportedLanguage = 'fr' | 'en'
export type MessageChannel = 'whatsapp' | 'telegram' | 'discord'
export type MessageDirection = 'incoming' | 'outgoing'
export type MessageType = 'text' | 'menu' | 'image' | 'document' | 'audio'

/**
 * Message entrant depuis un canal
 */
export interface IncomingMessage {
  channel: MessageChannel
  from: string
  text: string
  type: MessageType
  timestamp?: Date
  metadata?: Record<string, any>
}

/**
 * Message sortant vers un canal
 * Conservé tel quel mais ajusté pour cohérence
 */
export interface OutgoingMessage {
  to: string
  text: string // Changé de content pour cohérence
  type: MessageType
  metadata?: Record<string, any>
}

/**
 * Interface commune pour tous les adaptateurs de canaux
 */
export interface ChannelAdapter {
  readonly channel: MessageChannel

  start(): Promise<void>
  stop(): Promise<void>
  sendMessage(message: OutgoingMessage): Promise<void>
  isConnected(): boolean
  setCallbacks(callbacks: { onMessageReceived?: (message: IncomingMessage) => Promise<void> }): void
}

/**
 * Contexte de session utilisateur
 */
export interface SessionContext {
  userId: string
  channel: MessageChannel
  channelUserId: string
  currentWorkflow?: string
  currentStep?: string
  language: SupportedLanguage
  isVerified: boolean
  workflowData: Record<string, any>
  lastInteraction: Date
}

/**
 * Résultat de détection de commande système
 */
export interface CommandDetectionResult {
  detected: boolean
  type?: string
  command?: string
  blocked?: boolean
  reason?: string
}

/**
 * Configuration pour construire un message
 */
export interface MessageOptions {
  content: string
  subheader?: string
  footer?: string
  language: SupportedLanguage
  params?: Record<string, any>
}

/**
 * Information de progression dans un workflow
 */
export interface ProgressInfo {
  current: number
  total: number
  subflowName?: string
}
