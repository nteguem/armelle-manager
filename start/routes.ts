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
