/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']),

  /*
  |----------------------------------------------------------
  | Variables for configuring database connection
  |----------------------------------------------------------
  */
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for configuring bot
  |----------------------------------------------------------
  */
  BOT_ENABLED: Env.schema.boolean.optional(),

  // WhatsApp
  WHATSAPP_ENABLED: Env.schema.boolean.optional(),
  WHATSAPP_SESSION_PATH: Env.schema.string.optional(),
  WHATSAPP_QR_TIMEOUT: Env.schema.number.optional(),
  WHATSAPP_RECONNECT_DELAY: Env.schema.number.optional(),
  WHATSAPP_MAX_RECONNECT: Env.schema.number.optional(),

  // Session
  BOT_SESSION_TIMEOUT_HOURS: Env.schema.number.optional(),
  BOT_MAX_ACTIVE_WORKFLOWS: Env.schema.number.optional(),
  BOT_SESSION_CLEANUP_INTERVAL: Env.schema.number.optional(),
  BOT_MAX_NAVIGATION_STACK: Env.schema.number.optional(),

  // Messaging
  BOT_TYPING_SIMULATION: Env.schema.boolean.optional(),
  BOT_TYPING_WPM: Env.schema.number.optional(),
  BOT_MIN_TYPING_DELAY: Env.schema.number.optional(),
  BOT_MAX_TYPING_DELAY: Env.schema.number.optional(),
  BOT_RATE_LIMIT_PER_MINUTE: Env.schema.number.optional(),
  BOT_RATE_LIMIT_PER_HOUR: Env.schema.number.optional(),
  BOT_BLOCK_DURATION: Env.schema.number.optional(),
  BOT_MESSAGE_TIMEOUT: Env.schema.number.optional(),
  BOT_MESSAGE_MAX_RETRIES: Env.schema.number.optional(),
  BOT_MESSAGE_RETRY_DELAY: Env.schema.number.optional(),

  // Workflows
  BOT_DEFAULT_LANGUAGE: Env.schema.string.optional(),
  BOT_MAX_CONCURRENT_WORKFLOWS: Env.schema.number.optional(),
  BOT_WORKFLOW_STEP_TIMEOUT: Env.schema.number.optional(),
  BOT_PERSIST_CONTEXT_ON_ERROR: Env.schema.boolean.optional(),

  // Logging
  BOT_LOG_MESSAGES: Env.schema.boolean.optional(),
  BOT_LOG_WORKFLOW_STEPS: Env.schema.boolean.optional(),
  BOT_LOG_ERRORS: Env.schema.boolean.optional(),
  BOT_LOG_PERFORMANCE: Env.schema.boolean.optional(),
  BOT_MASK_SENSITIVE_DATA: Env.schema.boolean.optional(),

  // Modération
  BOT_AUTO_BLOCK_ENABLED: Env.schema.boolean.optional(),
  BOT_SPAM_THRESHOLD: Env.schema.number.optional(),
  BOT_ERROR_THRESHOLD: Env.schema.number.optional(),
  BOT_AUTO_BLOCK_DURATION: Env.schema.number.optional(),
  BOT_CONTENT_FILTER_ENABLED: Env.schema.boolean.optional(),
  BOT_MAX_MESSAGE_LENGTH: Env.schema.number.optional(),
  BOT_BLOCKED_PATTERNS: Env.schema.string.optional(),

  // Cache
  BOT_CACHE_ENABLED: Env.schema.boolean.optional(),
  BOT_CACHE_TTL: Env.schema.number.optional(),
  BOT_CACHE_PREFIX: Env.schema.string.optional(),
})
