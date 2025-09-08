import type { SessionContext, SupportedLanguage } from './bot_types.js'

/**
 * Informations sur un workflow disponible
 */
export interface WorkflowInfo {
  id: string
  name: string | ((language: SupportedLanguage) => string)
  description?: string | ((language: SupportedLanguage) => string)
  keywords?: string[]
}

/**
 * Contexte pour l'IA
 */
export interface AIContext {
  sessionContext: SessionContext
  availableWorkflows: WorkflowInfo[]
  userProfile?: {
    id: string
    language: string
    isVerified: boolean
  }
  conversationHistory?: string[]
  contextData?: Record<string, any>
}

/**
 * Options pour la requête IA
 */
export interface AIOptions {
  detectIntents?: boolean
  maxResponseLength?: number
  style?: 'formal' | 'friendly' | 'concise'
  temperature?: number
  maxTokens?: number
}

/**
 * Requête vers l'IA
 */
export interface AIRequest {
  message: string
  context: AIContext
  options?: AIOptions
}

/**
 * Réponse de l'IA
 */
export interface AIResponse {
  message: string
  intents?: DetectedIntent[]
  confidence?: number
  metadata?: Record<string, any>
}

/**
 * Intention détectée
 */
export interface DetectedIntent {
  workflowId: string
  confidence: number
  reason?: string
}

/**
 * Provider IA
 */
export interface AIProvider {
  name: string
  initialize(config: any): Promise<void>
  generateResponse(request: AIRequest): Promise<AIResponse>
  isAvailable(): boolean
  getUsageStats(): any
}
