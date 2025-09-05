// app/bot/core/workflow/definitions/workflow_types.ts

import type { SupportedLanguage } from '#bot/types/bot_types'

/**
 * Types de base pour le système de workflow
 */

export type StepType = 'input' | 'choice' | 'service' | 'message'

export interface WorkflowStep {
  id: string
  type: StepType
  prompt: string // Clé i18n ou texte direct

  // Navigation
  canGoBack?: boolean // Par défaut true
  nextStep?: string // Si non défini, passe au suivant dans l'ordre

  // Pour type 'input'
  validation?: {
    required?: boolean
    min?: number
    max?: number
    pattern?: string
  }

  // Pour type 'choice'
  choices?: Array<{
    value: string
    label: string
    nextStep?: string
  }>

  // Pour type 'service'
  service?: {
    name: string
    method: string
    params?: Record<string, any>
  }
}

export interface WorkflowDefinition {
  id: string
  version: string
  steps: WorkflowStep[]

  // Callbacks optionnels
  onComplete?: (data: Record<string, any>) => Promise<void>
  onError?: (error: Error) => Promise<void>
}

export interface WorkflowContext {
  workflowId: string
  currentStepIndex: number
  data: Record<string, any>
  history: string[] // IDs des étapes parcourues
  language: SupportedLanguage
}
