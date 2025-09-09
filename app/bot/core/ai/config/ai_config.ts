/**
 * Configuration du système IA
 */

export const AI_CONFIG = {
  // Provider par défaut
  defaultProvider: 'anthropic',

  // Configuration Anthropic
  anthropic: {
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    maxTokens: 400,
    temperature: 0.3,
  },

  // Limites
  limits: {
    maxHistoryMessages: 5,
    maxResponseLength: 500,
  },

  // Détection d'intention
  intent: {
    requireConfirmation: true,
  },
}

// Mots-clés de fallback (si l'IA ne répond pas)
export const WORKFLOW_KEYWORDS = {
  'igs-calculator': {
    fr: ['igs', 'salaire', 'impôt', 'calculer'],
    en: ['igs', 'salary', 'tax', 'calculate'],
  },
  'niu-finder': {
    fr: ['retrouver niu', 'perdu niu', 'trouver niu'],
    en: ['find niu', 'lost niu'],
  },
  'niu-request': {
    fr: ['demande niu', 'nouveau niu', 'obtenir niu'],
    en: ['request niu', 'new niu'],
  },
}
