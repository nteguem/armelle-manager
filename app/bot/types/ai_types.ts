// app/bot/types/ai_types.ts

import type { SessionContext, SupportedLanguage } from './bot_types.js'

/**
 * Types pour le système d'IA
 */

// Configuration d'un provider IA
export interface AIProviderConfig {
  name: string
  apiKey?: string
  model?: string
  maxTokens?: number
  temperature?: number
  endpoint?: string
}

// Contexte enrichi pour l'IA
export interface AIContext {
  sessionContext: SessionContext
  userProfile: {
    type: 'complete' | 'partial'
    fullName?: string
    niu?: string
  }
  conversationHistory: AIMessage[]
  availableWorkflows: WorkflowInfo[]
  currentDate: string
  language: SupportedLanguage
}

// Message dans l'historique
export interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
}

// Info sur un workflow pour l'IA
export interface WorkflowInfo {
  id: string
  name: string
  description?: string
  keywords?: string[]
}

// Intention détectée
export interface DetectedIntent {
  workflowId: string
  confidence: number
  reason?: string
  extractedParams?: Record<string, any>
}

// Réponse de l'IA
export interface AIResponse {
  message: string
  intents?: DetectedIntent[]
  suggestedWorkflow?: {
    id: string
    requiresConfirmation: boolean
    confirmationMessage?: string
  }
  metadata?: {
    tokensUsed?: number
    processingTime?: number
    provider?: string
  }
}

// Requête à l'IA
export interface AIRequest {
  message: string
  context: AIContext
  options?: {
    detectIntents?: boolean
    maxResponseLength?: number
    style?: 'formal' | 'friendly' | 'concise'
  }
}

// Interface pour tous les providers
export interface AIProvider {
  name: string

  initialize(config: AIProviderConfig): Promise<void>

  generateResponse(request: AIRequest): Promise<AIResponse>

  detectIntents(message: string, workflows: WorkflowInfo[]): Promise<DetectedIntent[]>

  isAvailable(): boolean

  getUsageStats(): {
    totalRequests: number
    totalTokens: number
    averageResponseTime: number
  }
}
