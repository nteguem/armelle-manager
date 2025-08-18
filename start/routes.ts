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
const BotUserController = () => import('#controllers/bot_user_controller')
const TaxRegistrationController = () => import('#controllers/tax_registration_controller')
const PaymentTransactionController = () => import('#controllers/payment_transaction_controller')

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

            // AJOUT: Route pour obtenir les utilisateurs d'un rôle
            router
              .get('/:id/users', [RolesController, 'getRoleUsers'])
              .middleware(middleware.permission(['roles.view']))
          })
          .prefix('/roles')

        /*
        |--------------------------------------------------------------------------
        | Permissions Management Routes
        |--------------------------------------------------------------------------
        */
        router
          .group(() => {
            // AJOUT: Liste des permissions (manquait)
            router
              .get('/', [PermissionsController, 'index'])
              .middleware(middleware.permission(['permissions.list']))

            // AJOUT: Modules disponibles (manquait)
            router
              .get('/modules', [PermissionsController, 'modules'])
              .middleware(middleware.permission(['permissions.list']))

            // AJOUT: Utilisateurs avec une permission (manquait)
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

            /*
            |--------------------------------------------------------------------------
            | CRUD Operations - Routes avec :id EN DERNIER
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
          })
          .prefix('/admin/tax-payers')

        /*
        |--------------------------------------------------------------------------
        | Tax Registration Management Routes
        |--------------------------------------------------------------------------
        */
        router
          .group(() => {
            // Statistiques
            router
              .get('/stats', [TaxRegistrationController, 'getStats'])
              .middleware(middleware.permission(['registration.stats']))

            /*
            |--------------------------------------------------------------------------
            | CRUD Operations - Routes avec :id EN DERNIER
            |--------------------------------------------------------------------------
            */

            // Liste paginée avec filtres et recherche
            router
              .get('/', [TaxRegistrationController, 'index'])
              .middleware(middleware.permission(['registration.list']))

            // Création d'une nouvelle demande d'immatriculation
            router
              .post('/', [TaxRegistrationController, 'store'])
              .middleware(middleware.permission(['registration.create']))

            // Détails d'une demande spécifique
            router
              .get('/:id', [TaxRegistrationController, 'show'])
              .middleware(middleware.permission(['registration.view']))

            // Mise à jour d'une demande
            router
              .put('/:id', [TaxRegistrationController, 'update'])
              .middleware(middleware.permission(['registration.update']))

            // Traitement d'une demande (NIU + document)
            router
              .post('/:id/process', [TaxRegistrationController, 'process'])
              .middleware(middleware.permission(['registration.process']))

            // Rejet d'une demande
            router
              .post('/:id/reject', [TaxRegistrationController, 'reject'])
              .middleware(middleware.permission(['registration.process']))
          })
          .prefix('/admin/tax-registrations')

        /*
        |--------------------------------------------------------------------------
        | Payment Transactions Management Routes
        |--------------------------------------------------------------------------
        */
        router
          .group(() => {
            // Statistiques des transactions de paiement
            router
              .get('/stats', [PaymentTransactionController, 'getStats'])
              .middleware(middleware.permission(['payment.stats']))

            // Récupérer les transactions par demande d'immatriculation
            router
              .get('/registration/:registration_id', [
                PaymentTransactionController,
                'getByRegistrationRequest',
              ])
              .middleware(middleware.permission(['payment.view']))

            /*
            |--------------------------------------------------------------------------
            | CRUD Operations - Routes avec :id EN DERNIER
            |--------------------------------------------------------------------------
            */

            // Liste paginée avec filtres et recherche
            router
              .get('/', [PaymentTransactionController, 'index'])
              .middleware(middleware.permission(['payment.list']))

            // Créer et initier une nouvelle transaction de paiement
            router
              .post('/', [PaymentTransactionController, 'store'])
              .middleware(middleware.permission(['payment.create']))

            // Détails d'une transaction spécifique
            router
              .get('/:id', [PaymentTransactionController, 'show'])
              .middleware(middleware.permission(['payment.view']))

            // Vérifier manuellement le statut d'une transaction
            router
              .post('/:id/check-status', [PaymentTransactionController, 'checkStatus'])
              .middleware(middleware.permission(['payment.check']))
          })
          .prefix('/admin/payment-transactions')

        /*
        |--------------------------------------------------------------------------
        | Bot Users Management Routes
        |--------------------------------------------------------------------------
        */
        router
          .group(() => {
            // Statistiques des bot users
            router
              .get('/stats', [BotUserController, 'getStats'])
              .middleware(middleware.permission(['botuser.stats']))

            /*
            |--------------------------------------------------------------------------
            | CRUD Operations - Routes avec :id EN DERNIER
            |--------------------------------------------------------------------------
            */

            // Liste paginée avec filtres et recherche
            router
              .get('/', [BotUserController, 'index'])
              .middleware(middleware.permission(['botuser.list']))

            // Détails d'un bot user spécifique
            router
              .get('/:id', [BotUserController, 'show'])
              .middleware(middleware.permission(['botuser.view']))

            // Mise à jour d'un bot user
            router
              .put('/:id', [BotUserController, 'update'])
              .middleware(middleware.permission(['botuser.update']))

            // Suppression d'un bot user
            router
              .delete('/:id', [BotUserController, 'destroy'])
              .middleware(middleware.permission(['botuser.delete']))

            // Taxpayers liés à ce bot user
            router
              .get('/:id/taxpayers', [BotUserController, 'getTaxpayers'])
              .middleware(middleware.permission(['botuser.view']))
          })
          .prefix('/admin/bot-users')
      })
      .middleware(middleware.nellysAuth())
  })
  .prefix('/api/v1')
