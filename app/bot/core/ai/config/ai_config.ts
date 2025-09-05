/**
 * Configuration du système IA
 */

export const AI_CONFIG = {
  // Provider par défaut
  defaultProvider: 'anthropic',

  // Configuration Anthropic
  anthropic: {
    model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
    maxTokens: Number.parseInt(process.env.ANTHROPIC_MAX_TOKENS || '500'),
    temperature: Number.parseFloat(process.env.ANTHROPIC_TEMPERATURE || '0.7'),
  },

  // Limites et seuils
  limits: {
    maxHistoryMessages: 5,
    maxContextTokens: 2000,
    maxResponseLength: 500,
  },

  // Détection d'intention
  intent: {
    confidenceThreshold: 0.7,
    suggestionThreshold: 0.8,
    requireConfirmation: true,
  },

  // Cache (pour économiser les tokens)
  cache: {
    enabled: true,
    ttlSeconds: 300, // 5 minutes
    maxEntries: 100,
  },

  // Timeouts
  timeouts: {
    apiCallMs: 30000, // 30 secondes
    contextBuildMs: 5000,
  },
}

// Workflows et leurs mots-clés pour la détection
export const WORKFLOW_KEYWORDS = {
  'igs-calculator': {
    fr: ['igs', 'salaire', 'impôt', 'calculer', 'calcul', 'paie'],
    en: ['igs', 'salary', 'tax', 'calculate', 'calculation', 'payroll'],
  },

  'tax-declaration': {
    fr: ['déclarer', 'déclaration', 'télédéclaration', 'déclarer impôt'],
    en: ['declare', 'declaration', 'file tax', 'submit'],
  },

  'tax-schedule': {
    fr: ['échéance', 'calendrier', 'date', 'paiement', 'quand payer'],
    en: ['deadline', 'calendar', 'date', 'payment', 'when to pay'],
  },

  'registration-request': {
    fr: ['immatriculation', 'entreprise', 'créer', 'enregistrer', 'niu'],
    en: ['registration', 'company', 'create', 'register', 'niu'],
  },
}
