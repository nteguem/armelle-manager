import type { SupportedLanguage, MessageChannel } from '#bot/types/bot_types'

export default {
  /**
   * Configuration générale du bot
   */
  general: {
    name: 'Armelle',
    version: '1.0.0',
    description: 'Assistant fiscal virtuel du Cameroun',
    defaultLanguage: 'fr' as SupportedLanguage,
    supportedLanguages: ['fr', 'en'] as SupportedLanguage[],
  },

  /**
   * Canaux de communication
   */
  channels: {
    enabled: ['whatsapp'] as MessageChannel[],
    primary: 'whatsapp' as MessageChannel,
    whatsapp: {
      enabled: true,
      authPath: 'storage/whatsapp_auth',
      maxMessageLength: 4096,
      typingSimulation: true,
    },
    // telegram: {
    //   enabled: false,
    //   botToken: '', // À configurer
    //   maxMessageLength: 4096,
    // },
  },

  /**
   * Sessions utilisateur
   */
  sessions: {
    timeoutMinutes: 60,
    maxInactiveHours: 24,
    cleanupIntervalHours: 6,
    maxContextSize: 1024, // KB
  },

  /**
   * Messages et réponses
   */
  messages: {
    maxResponseTimeMs: 5000,
    typingDelayMs: 1000,
    errorRetryAttempts: 3,
    defaultFooter: true,
    typingSimulation: true,
  },

  /**
   * Logs et monitoring
   */
  logging: {
    enabled: true,
    level: 'info',
    logMessages: true,
    logWorkflows: true,
    logErrors: true,
  },

  /**
   * Limites de sécurité
   */
  security: {
    maxMessagesPerMinute: 20,
    maxMessagesPerHour: 100,
    blockSpam: true,
    rateLimitWindow: 60000, // 1 minute
  },
}
