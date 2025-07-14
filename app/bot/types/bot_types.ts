/**
 * Langues supportées par le bot
 */
export type SupportedLanguage = 'fr' | 'en'

/**
 * Canaux de communication supportés
 */
export type MessageChannel = 'whatsapp' | 'telegram' | 'discord'

/**
 * Direction des messages
 */
export type MessageDirection = 'incoming' | 'outgoing'

/**
 * Types de messages
 */
export type MessageType = 'text' | 'menu' | 'image' | 'document' | 'audio'

/**
 * Message entrant depuis un canal
 */
export interface IncomingMessage {
  channel: MessageChannel
  channelUserId: string
  content: string
  messageType: MessageType
  timestamp: Date
  rawData: Record<string, any>
}

/**
 * Message sortant vers un canal
 */
export interface OutgoingMessage {
  channel: MessageChannel
  to: string
  content: string
  messageType: MessageType
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

/**
 * Résultat de recherche DGI
 */
export interface SearchResult {
  niu: string
  nomRaisonSociale: string
  prenomSigle?: string
  centreImpots?: string
  activite?: string
  regime?: string
  numeroCniRc?: string
}

/**
 * Réponse du scraper DGI
 */
export interface ScraperResponse<T> {
  success: boolean
  message: string
  data: T | null
  type?: 'aucune' | 'unique' | 'multiple' | 'erreur'
}

/**
 * Résultat de vérification NIU
 */
export interface VerifyResult {
  niu: string
  nom: string
  prenom?: string
  numeroDocument?: string
  activite?: string
  regime?: string
  etat?: string
}
