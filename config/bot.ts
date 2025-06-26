import env from '#start/env'

export default {
  /**
   * Configuration générale du bot
   */
  enabled: env.get('BOT_ENABLED', true),

  /**
   * Configuration des canaux de messagerie
   */
  channels: {
    whatsapp: {
      enabled: env.get('WHATSAPP_ENABLED', true),
      sessionPath: env.get('WHATSAPP_SESSION_PATH', 'storage/whatsapp_auth'),
      qrTimeoutMs: env.get('WHATSAPP_QR_TIMEOUT', 60000),
      reconnectDelayMs: env.get('WHATSAPP_RECONNECT_DELAY', 5000),
      maxReconnectAttempts: env.get('WHATSAPP_MAX_RECONNECT', 5),
    },
  },

  /**
   * Configuration des sessions utilisateur
   */
  session: {
    timeoutHours: env.get('BOT_SESSION_TIMEOUT_HOURS', 24),
    maxActiveWorkflows: env.get('BOT_MAX_ACTIVE_WORKFLOWS', 5),
    cleanupIntervalHours: env.get('BOT_SESSION_CLEANUP_INTERVAL', 6),
    maxNavigationStackSize: env.get('BOT_MAX_NAVIGATION_STACK', 50),
  },

  /**
   * Configuration des messages
   */
  messaging: {
    typingSimulation: {
      enabled: env.get('BOT_TYPING_SIMULATION', true),
      wordsPerMinute: env.get('BOT_TYPING_WPM', 60),
      minDelayMs: env.get('BOT_MIN_TYPING_DELAY', 500),
      maxDelayMs: env.get('BOT_MAX_TYPING_DELAY', 3000),
    },
    rateLimit: {
      maxMessagesPerMinute: env.get('BOT_RATE_LIMIT_PER_MINUTE', 20),
      maxMessagesPerHour: env.get('BOT_RATE_LIMIT_PER_HOUR', 100),
      blockDurationMinutes: env.get('BOT_BLOCK_DURATION', 15),
    },
    processing: {
      timeoutMs: env.get('BOT_MESSAGE_TIMEOUT', 30000),
      maxRetries: env.get('BOT_MESSAGE_MAX_RETRIES', 3),
      retryDelayMs: env.get('BOT_MESSAGE_RETRY_DELAY', 1000),
    },
  },

  /**
   * Configuration des workflows
   */
  workflows: {
    defaultLanguage: env.get('BOT_DEFAULT_LANGUAGE', 'fr'),
    supportedLanguages: ['fr', 'en'],
    maxConcurrentWorkflows: env.get('BOT_MAX_CONCURRENT_WORKFLOWS', 3),
    stepTimeoutMs: env.get('BOT_WORKFLOW_STEP_TIMEOUT', 300000), // 5 minutes
    persistContextOnError: env.get('BOT_PERSIST_CONTEXT_ON_ERROR', true),
  },

  /**
   * Configuration Socket.IO pour QR Code
   */
  socket: {
    enabled: env.get('SOCKET_ENABLED', true),
    port: env.get('SOCKET_PORT', 3334),
    cors: {
      origin: env.get('SOCKET_CORS_ORIGIN', 'http://localhost:3000'),
      credentials: true,
    },
    qr: {
      updateIntervalMs: env.get('SOCKET_QR_UPDATE_INTERVAL', 2000),
      expirationMinutes: env.get('SOCKET_QR_EXPIRATION', 5),
    },
  },

  /**
   * Configuration logging bot
   */
  logging: {
    logMessages: env.get('BOT_LOG_MESSAGES', true),
    logWorkflowSteps: env.get('BOT_LOG_WORKFLOW_STEPS', true),
    logErrors: env.get('BOT_LOG_ERRORS', true),
    logPerformance: env.get('BOT_LOG_PERFORMANCE', false),
    sensitiveDataMask: env.get('BOT_MASK_SENSITIVE_DATA', true),
  },

  /**
   * Configuration modération automatique
   */
  moderation: {
    autoBlock: {
      enabled: env.get('BOT_AUTO_BLOCK_ENABLED', true),
      spamThreshold: env.get('BOT_SPAM_THRESHOLD', 10), // messages/minute
      errorThreshold: env.get('BOT_ERROR_THRESHOLD', 5), // erreurs consécutives
      blockDurationHours: env.get('BOT_AUTO_BLOCK_DURATION', 1),
    },
    contentFilter: {
      enabled: env.get('BOT_CONTENT_FILTER_ENABLED', true),
      maxMessageLength: env.get('BOT_MAX_MESSAGE_LENGTH', 1000),
      blockedPatterns: env.get('BOT_BLOCKED_PATTERNS', '').split(',').filter(Boolean),
    },
  },

  /**
   * Configuration cache et performance
   */
  cache: {
    enabled: env.get('BOT_CACHE_ENABLED', true),
    ttlSeconds: env.get('BOT_CACHE_TTL', 3600),
    keyPrefix: env.get('BOT_CACHE_PREFIX', 'bot:'),
  },
} as const
