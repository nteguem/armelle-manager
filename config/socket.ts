import env from '#start/env'

export default {
  /**
   * Configuration Socket.IO pour QR Code WhatsApp
   */
  enabled: env.get('SOCKET_ENABLED', true),
  port: env.get('SOCKET_PORT', 3334),

  /**
   * Configuration CORS
   */
  cors: {
    origin: env.get('SOCKET_CORS_ORIGIN', 'http://localhost:3000'),
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  },

  /**
   * Configuration QR Code
   */
  qr: {
    updateIntervalMs: env.get('SOCKET_QR_UPDATE_INTERVAL', 2000),
    expirationMinutes: env.get('SOCKET_QR_EXPIRATION', 5),
    cleanupIntervalMs: 30000, // Nettoyage toutes les 30s
  },

  /**
   * Configuration connexions
   */
  connection: {
    maxConnections: 100,
    timeoutMs: 60000,
    pingTimeoutMs: 5000,
    pingIntervalMs: 25000,
  },

  /**
   * Événements Socket.IO
   */
  events: {
    // Client → Server
    qrRequest: 'qr:request',
    qrScanned: 'qr:scanned',
    disconnect: 'disconnect',

    // Server → Client
    qrUpdate: 'qr:update',
    qrExpired: 'qr:expired',
    qrSuccess: 'qr:success',
    qrClear: 'qr:clear',
    connectionStatus: 'connection:status',
  },
} as const
