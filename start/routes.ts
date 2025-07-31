/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'
const AuthController = () => import('#controllers/auth_controller')
const PasswordResetController = () => import('#controllers/password_reset_controller')
const RolesController = () => import('#controllers/roles_controller')
const PermissionsController = () => import('#controllers/permissions_controller')
const UserController = () => import('#controllers/users_controller')
const TaxPayerController = () => import('#controllers/tax_payer_controller')

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
      router.post('/auth/setup-authenticator', [AuthController, 'handleMfaConfiguration'])
      router.post('/auth/verify-authenticator', [AuthController, 'handleMfaVerification'])
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
        | Roles Management Routes
        |--------------------------------------------------------------------------
        */
        router
          .group(() => {
            router
              .get('/', [RolesController, 'index'])
              .middleware(middleware.permission(['roles.list']))

            router
              .get('/:id', [RolesController, 'show'])
              .middleware(middleware.permission(['roles.view']))

            router
              .post('/', [RolesController, 'store'])
              .middleware(middleware.permission(['roles.create']))

            router
              .put('/:id', [RolesController, 'update'])
              .middleware(middleware.permission(['roles.update']))

            router
              .delete('/:id', [RolesController, 'destroy'])
              .middleware(middleware.permission(['roles.delete']))

            router
              .post('/:id/permissions', [RolesController, 'assignPermissions'])
              .middleware(middleware.permission(['roles.assign_permissions']))
          })
          .prefix('/roles')

        /*
        |--------------------------------------------------------------------------
        | Permissions Management Routes
        |--------------------------------------------------------------------------
        */
        router
          .group(() => {
            router
              .get('/', [PermissionsController, 'index'])
              .middleware(middleware.permission(['permissions.list']))

            router
              .get('/modules', [PermissionsController, 'modules'])
              .middleware(middleware.permission(['permissions.list']))

            router
              .get('/:name/users', [PermissionsController, 'getUsersWithPermission'])
              .middleware(middleware.permission(['permissions.list']))
          })
          .prefix('/permissions')

        /*
        |--------------------------------------------------------------------------
        | Users Management Routes 
        |--------------------------------------------------------------------------
        */
        router
          .group(() => {
            // Management users
            router
              .get('/', [UserController, 'index'])
              .middleware(middleware.permission(['users.list']))

            router
              .get('/:id', [UserController, 'show'])
              .middleware(middleware.permission(['users.view']))

            // Management user roles
            router
              .get('/:userId/roles', [UserController, 'getUserRoles'])
              .middleware(middleware.permission(['users.view']))

            router.post('/:userId/roles', [UserController, 'assignRole'])
            // TODO: RÉACTIVER EN PRODUCTION
            // .middleware(middleware.permission(['users.assign_roles']))

            router
              .delete('/:userId/roles/:roleId', [UserController, 'removeRole'])
              .middleware(middleware.permission(['users.assign_roles']))

            // Management permissions users
            router
              .get('/:userId/permissions', [PermissionsController, 'userPermissions'])
              .middleware(middleware.permission(['users.view']))

            router
              .post('/:userId/permissions', [PermissionsController, 'grantToUser'])
              .middleware(middleware.permission(['users.assign_roles']))

            router
              .delete('/:userId/permissions/:permissionId', [
                PermissionsController,
                'revokeFromUser',
              ])
              .middleware(middleware.permission(['users.assign_roles']))

            router
              .get('/:userId/permissions/check', [PermissionsController, 'checkUserPermission'])
              .middleware(middleware.permission(['users.view']))
          })
          .prefix('/users')

        /*
        |--------------------------------------------------------------------------
        | Tax Payers Management Routes
        |--------------------------------------------------------------------------
        */
        router
          .group(() => {
            /*
            |--------------------------------------------------------------------------
            | CRUD Operations
            |--------------------------------------------------------------------------
            */
            // Liste paginée avec filtres et recherche
            router
              .get('/', [TaxPayerController, 'index'])
              .middleware(middleware.permission(['taxpayer.list']))

            // Création d'un nouveau taxpayer
            router
              .post('/', [TaxPayerController, 'store'])
              .middleware(middleware.permission(['taxpayer.create']))

            // Détails d'un taxpayer spécifique
            router
              .get('/:id', [TaxPayerController, 'show'])
              .middleware(middleware.permission(['taxpayer.view']))

            // Mise à jour d'un taxpayer
            router
              .put('/:id', [TaxPayerController, 'update'])
              .middleware(middleware.permission(['taxpayer.update']))

            // Suppression d'un taxpayer
            router
              .delete('/:id', [TaxPayerController, 'destroy'])
              .middleware(middleware.permission(['taxpayer.delete']))

            // Synchronisation avec la DGI
            router
              .post('/:id/sync-dgi', [TaxPayerController, 'syncWithDgi'])
              .middleware(middleware.permission(['taxpayer.sync']))
            // Endpoint universel de recherche taxpayer
            router
              .post('/search', [TaxPayerController, 'search'])
              .middleware(middleware.permission(['taxpayer.search']))
            // Test de connectivité DGI
            router
              .get('/test', [TaxPayerController, 'testConnectivity'])
              .middleware(middleware.permission(['taxpayer.search']))

            // Nettoyage des ressources DGI
            router
              .post('/cleanup', [TaxPayerController, 'cleanup'])
              .middleware(middleware.permission(['admin.*']))

            // Liste des centres découverts
            router
              .get('/centres', [TaxPayerController, 'getCentres'])
              .middleware(middleware.permission(['taxpayer.list']))

            // Détails d'un centre avec ses contribuables
            router
              .get('/centres/:nom', [TaxPayerController, 'getCentreDetails'])
              .middleware(middleware.permission(['taxpayer.list']))
          })
          .prefix('/admin/tax-payers')
      })
      .middleware(middleware.nellysAuth())
  })
  .prefix('/api/v1')
