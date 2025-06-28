/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import { middleware } from './kernel.js'

// Import des controllers
const AuthController = () => import('#controllers/auth_controller')
const UsersController = () => import('#controllers/users_controller')
const RolesController = () => import('#controllers/roles_controller')
const BotController = () => import('#controllers/bot_controller')

/*
|--------------------------------------------------------------------------
| Routes d'authentification (publiques)
|--------------------------------------------------------------------------
*/
router
  .group(() => {
    // Authentification selon tes specs
    router.post('/login', [AuthController, 'login'])
    router.post('/logout', [AuthController, 'logout']).use(middleware.auth())
    router.get('/me', [AuthController, 'me']).use(middleware.auth())

    // Réinitialisation de mot de passe
    router.post('/forgot-password', [AuthController, 'forgotPassword'])
    router.post('/reset-password', [AuthController, 'resetPassword'])

    // Vérification d'email
    router.post('/verify-email', [AuthController, 'verifyEmail'])

    // OTP (pour plus tard si besoin)
    // router.post('/request-otp', [AuthController, 'requestOtp'])
    // router.post('/verify-otp', [AuthController, 'verifyOtp'])
  })
  .prefix('/api/auth')

/*
|--------------------------------------------------------------------------
| Routes protégées (nécessitent authentification)
|--------------------------------------------------------------------------
*/
router
  .group(() => {
    /*
  |--------------------------------------------------------------------------
  | Gestion des utilisateurs
  |--------------------------------------------------------------------------
  */
    router
      .group(() => {
        router.get('/', [UsersController, 'index']) // GET /api/users
        router.post('/', [UsersController, 'store']) // POST /api/users
        router.get('/:id', [UsersController, 'show']) // GET /api/users/:id
        router.put('/:id', [UsersController, 'update']) // PUT /api/users/:id
        router.delete('/:id', [UsersController, 'destroy']) // DELETE /api/users/:id

        // Actions spécifiques selon tes specs
        router.put('/:id/status', [UsersController, 'updateStatus']) // PUT /api/users/:id/status
        router.post('/:id/reset-password', [UsersController, 'adminResetPassword']) // POST /api/users/:id/reset-password
      })
      .prefix('/users')

    /*
  |--------------------------------------------------------------------------
  | Gestion des rôles
  |--------------------------------------------------------------------------
  */
    router
      .group(() => {
        router.get('/', [RolesController, 'index']) // GET /api/roles
        router.post('/', [RolesController, 'store']) // POST /api/roles
        router.get('/:id', [RolesController, 'show']) // GET /api/roles/:id
        router.put('/:id', [RolesController, 'update']) // PUT /api/roles/:id
        router.delete('/:id', [RolesController, 'destroy']) // DELETE /api/roles/:id
      })
      .prefix('/roles')

    /*
  |--------------------------------------------------------------------------
  | Gestion des permissions
  |--------------------------------------------------------------------------
  */
    router.get('/permissions', [RolesController, 'permissions']) // GET /api/permissions
  })
  .prefix('/api')
  .use(middleware.auth())

/*
|--------------------------------------------------------------------------
| Route de santé (publique)
|--------------------------------------------------------------------------
*/
router.get('/', async () => {
  return {
    message: 'Armelle Manager API',
    version: '1.0.0',
    status: 'active',
    timestamp: new Date().toISOString(),
  }
})

router.get('/health', async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }
})

/*
|--------------------------------------------------------------------------
| 🚀 SOLUTION 1: Route SSE sans middleware CORS
|--------------------------------------------------------------------------
*/

// 📡 Route SSE Events - SANS middleware pour bypasser CORS
router
  .get('/api/bot/events', async ({ response, request }: { response: any; request: any }) => {
    console.log('📡 SSE Route: Direct call without middleware')

    // Headers CORS + SSE définis manuellement
    response.header('Access-Control-Allow-Origin', 'http://localhost:3000')
    response.header('Access-Control-Allow-Methods', 'GET, OPTIONS')
    response.header('Access-Control-Allow-Headers', 'Content-Type, Cache-Control, Accept')
    response.header('Access-Control-Allow-Credentials', 'false')
    response.header('Content-Type', 'text/event-stream')
    response.header('Cache-Control', 'no-cache')
    response.header('Connection', 'keep-alive')
    response.header('X-Accel-Buffering', 'no')

    const res = response.response

    console.log('📡 SSE: Manual CORS headers set, starting stream...')

    try {
      // Import de l'EventBus
      const { botEventBus } = await import('#bot/core/event_bus')

      // Envoi immédiat pour établir la connexion
      res.write(`retry: 10000\n`)
      res.write(`event: connected\n`)
      res.write(`data: {"status":"connected","timestamp":${Date.now()}}\n\n`)

      if ('flush' in res && typeof res.flush === 'function') {
        res.flush()
      }

      // Envoyer l'état initial
      const currentState = botEventBus.getCurrentState()
      console.log('📡 SSE: Sending initial state:', currentState)
      res.write(`event: initial_state\n`)
      res.write(`data: ${JSON.stringify(currentState)}\n\n`)

      if ('flush' in res && typeof res.flush === 'function') {
        res.flush()
      }

      // Event handlers
      const onQRUpdate = (data: any) => {
        console.log('📡 SSE: Sending QR update:', data)
        try {
          res.write(`event: qr_update\n`)
          res.write(`data: ${JSON.stringify(data)}\n\n`)
          if ('flush' in res && typeof res.flush === 'function') {
            res.flush()
          }
        } catch (error: any) {
          console.error('📡 SSE: Error sending QR update:', error)
        }
      }

      const onStatusUpdate = (data: any) => {
        console.log('📡 SSE: Sending status update:', data)
        try {
          res.write(`event: status_update\n`)
          res.write(`data: ${JSON.stringify(data)}\n\n`)
          if ('flush' in res && typeof res.flush === 'function') {
            res.flush()
          }
        } catch (error: any) {
          console.error('📡 SSE: Error sending status update:', error)
        }
      }

      const onQRCleared = (data: any) => {
        console.log('📡 SSE: Sending QR cleared:', data)
        try {
          res.write(`event: qr_cleared\n`)
          res.write(`data: ${JSON.stringify(data)}\n\n`)
          if ('flush' in res && typeof res.flush === 'function') {
            res.flush()
          }
        } catch (error: any) {
          console.error('📡 SSE: Error sending QR cleared:', error)
        }
      }

      const onMessageReceived = (data: any) => {
        console.log('📡 SSE: Sending message received:', data)
        try {
          res.write(`event: message_received\n`)
          res.write(`data: ${JSON.stringify(data)}\n\n`)
          if ('flush' in res && typeof res.flush === 'function') {
            res.flush()
          }
        } catch (error: any) {
          console.error('📡 SSE: Error sending message:', error)
        }
      }

      // Enregistrer les event listeners
      console.log('📡 SSE: Registering event listeners...')
      botEventBus.on('whatsapp:qr_generated', onQRUpdate)
      botEventBus.on('whatsapp:connection_update', onStatusUpdate)
      botEventBus.on('whatsapp:qr_cleared', onQRCleared)
      botEventBus.on('whatsapp:message_received', onMessageReceived)

      // Keep-alive ping
      const keepAlive = setInterval(() => {
        console.log('📡 SSE: Sending ping...')
        try {
          res.write(`event: ping\n`)
          res.write(`data: {"timestamp":${Date.now()}}\n\n`)
          if ('flush' in res && typeof res.flush === 'function') {
            res.flush()
          }
        } catch (error: any) {
          console.error('📡 SSE: Error sending ping:', error)
          performCleanup()
        }
      }, 15000)

      // Fonction de nettoyage
      const performCleanup = () => {
        console.log('📡 SSE: Cleaning up connection...')

        try {
          clearInterval(keepAlive)
          botEventBus.off('whatsapp:qr_generated', onQRUpdate)
          botEventBus.off('whatsapp:connection_update', onStatusUpdate)
          botEventBus.off('whatsapp:qr_cleared', onQRCleared)
          botEventBus.off('whatsapp:message_received', onMessageReceived)
        } catch (error: any) {
          console.error('📡 SSE: Error during cleanup:', error)
        }

        console.log('📡 SSE: Client disconnected')
      }

      // Event listeners pour la déconnexion
      request.request.on('close', () => {
        console.log('📡 SSE: Request closed')
        performCleanup()
      })

      request.request.on('aborted', () => {
        console.log('📡 SSE: Request aborted')
        performCleanup()
      })

      res.on('close', () => {
        console.log('📡 SSE: Response closed')
        performCleanup()
      })

      res.on('error', (error: any) => {
        console.error('📡 SSE: Response error:', error)
        performCleanup()
      })
    } catch (error: any) {
      console.error('📡 SSE: Fatal error in direct route:', error)
      res.end()
    }
  })
  .middleware([]) // 🔧 IMPORTANT: Aucun middleware !

// 🔧 Route OPTIONS pour preflight CORS (méthode alternative)
router
  .get('/api/bot/events-options', async ({ response }: { response: any }) => {
    console.log('📡 OPTIONS: CORS preflight for SSE')

    response.header('Access-Control-Allow-Origin', 'http://localhost:3000')
    response.header('Access-Control-Allow-Methods', 'GET, OPTIONS')
    response.header('Access-Control-Allow-Headers', 'Content-Type, Cache-Control, Accept')
    response.header('Access-Control-Allow-Credentials', 'false')
    response.header('Access-Control-Max-Age', '86400')

    return response.status(200).send('')
  })
  .middleware([]) // Pas de middleware non plus

/*
|--------------------------------------------------------------------------
| Autres Routes Bot API (avec middleware normal)
|--------------------------------------------------------------------------
*/
router
  .group(() => {
    router.get('/status', [BotController, 'getStatus'])
    router.post('/reconnect', [BotController, 'reconnect'])
    router.get('/stats', [BotController, 'getStats'])
    router.delete('/qr', [BotController, 'clearQR'])
    router.post('/test-qr', [BotController, 'testQR'])
    router.post('/test-message', [BotController, 'testMessage'])
    router.get('/logs', [BotController, 'getLogs'])
  })
  .prefix('/api/bot')
