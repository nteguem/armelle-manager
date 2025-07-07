/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
const AuthController = () => import('#controllers/auth_controller')
const PasswordResetController = () => import('#controllers/password_reset_controller')

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

/*
|--------------------------------------------------------------------------
| API V1 Routes
|--------------------------------------------------------------------------
*/
router
  .group(() => {
    /*
    |--------------------------------------------------------------------------
    | Authentication Routes (Public)
    |--------------------------------------------------------------------------
    */
    router.group(() => {
      // Login
      router.post('/auth/login', [AuthController, 'login'])

      // MFA confirmation
      router.post('/auth/confirm-mfa-code', [AuthController, 'confirmMfaCode'])

      // Token refresh
      router.post('/auth/refresh', [AuthController, 'refreshToken'])

      // Password reset
      router.get('/passwords/email', [PasswordResetController, 'initiate'])
      router.post('/passwords/code', [PasswordResetController, 'verifyCode'])
      router.post('/passwords/reset', [PasswordResetController, 'reset'])
    })

    /*
    |--------------------------------------------------------------------------
    | Protected Routes (Require Authentication)
    |--------------------------------------------------------------------------
    */
    router
      .group(() => {
        // Logout
        router.post('/auth/logout', [AuthController, 'logout'])

        /*
        |--------------------------------------------------------------------------
        | DGI Routes (Protected)
        |--------------------------------------------------------------------------
        */
        router
          .group(() => {
            // Endpoint universel de recherche
            router.post('/search', '#controllers/dgi_controller.search')

            // Test de connectivité
            router.get('/test', '#controllers/dgi_controller.testConnectivity')

            // Nettoyage des ressources
            router.post('/cleanup', '#controllers/dgi_controller.cleanup')
          })
          .prefix('admin/dgi')
      })
      .middleware([middleware.nellysAuth(), middleware.panelAccess()])
  })
  .prefix('/api/v1')
