import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Permission from '#models/permission'
import Role from '#models/role'

export default class extends BaseSeeder {
  async run() {
    // Define permissions by module
    const permissionsByModule = {
      users: [
        {
          name: 'users.list',
          displayName: 'Lister les utilisateurs',
          description: 'Voir la liste des utilisateurs',
        },
        {
          name: 'users.view',
          displayName: 'Voir un utilisateur',
          description: "Voir les détails d'un utilisateur",
        },
        {
          name: 'users.create',
          displayName: 'Créer un utilisateur',
          description: 'Créer de nouveaux utilisateurs',
        },
        {
          name: 'users.update',
          displayName: 'Modifier un utilisateur',
          description: 'Modifier les informations des utilisateurs',
        },
        {
          name: 'users.delete',
          displayName: 'Supprimer un utilisateur',
          description: 'Supprimer des utilisateurs',
        },
        {
          name: 'users.assign_roles',
          displayName: 'Assigner des rôles',
          description: 'Assigner ou retirer des rôles aux utilisateurs',
        },
      ],
      roles: [
        {
          name: 'roles.list',
          displayName: 'Lister les rôles',
          description: 'Voir la liste des rôles',
        },
        {
          name: 'roles.view',
          displayName: 'Voir un rôle',
          description: "Voir les détails d'un rôle",
        },
        {
          name: 'roles.create',
          displayName: 'Créer un rôle',
          description: 'Créer de nouveaux rôles',
        },
        {
          name: 'roles.update',
          displayName: 'Modifier un rôle',
          description: 'Modifier les rôles existants',
        },
        {
          name: 'roles.delete',
          displayName: 'Supprimer un rôle',
          description: 'Supprimer des rôles',
        },
        {
          name: 'roles.assign_permissions',
          displayName: 'Gérer les permissions',
          description: 'Assigner ou retirer des permissions aux rôles',
        },
      ],
      permissions: [
        {
          name: 'permissions.list',
          displayName: 'Lister les permissions',
          description: 'Voir la liste des permissions',
        },
        {
          name: 'permissions.sync',
          displayName: 'Synchroniser les permissions',
          description: 'Synchroniser les permissions avec le code',
        },
      ],
      taxpayer: [
        {
          name: 'taxpayer.list',
          displayName: 'Lister les contribuables',
          description: 'Voir la liste des contribuables',
        },
        {
          name: 'taxpayer.view',
          displayName: 'Voir un contribuable',
          description: "Voir les détails d'un contribuable",
        },
        {
          name: 'taxpayer.create',
          displayName: 'Créer un contribuable',
          description: 'Créer de nouveaux contribuables',
        },
        {
          name: 'taxpayer.update',
          displayName: 'Modifier un contribuable',
          description: 'Modifier les informations des contribuables',
        },
        {
          name: 'taxpayer.delete',
          displayName: 'Supprimer un contribuable',
          description: 'Supprimer des contribuables',
        },
        {
          name: 'taxpayer.search',
          displayName: 'Rechercher DGI',
          description: 'Effectuer des recherches dans la base DGI',
        },
        {
          name: 'taxpayer.sync',
          displayName: 'Synchroniser DGI',
          description: 'Synchroniser avec la DGI',
        },
        {
          name: 'taxpayer.export',
          displayName: 'Exporter DGI',
          description: 'Exporter les résultats de recherche DGI',
        },
        {
          name: 'taxpayer.bulk_search',
          displayName: 'Recherche en masse',
          description: 'Effectuer des recherches en masse',
        },
        {
          name: 'taxpayer.view_history',
          displayName: 'Historique DGI',
          description: "Voir l'historique des recherches",
        },
      ],
      registration: [
        {
          name: 'registration.list',
          displayName: 'Lister les demandes',
          description: "Voir la liste des demandes d'immatriculation",
        },
        {
          name: 'registration.view',
          displayName: 'Voir une demande',
          description: "Voir les détails d'une demande d'immatriculation",
        },
        {
          name: 'registration.create',
          displayName: 'Créer une demande',
          description: "Créer de nouvelles demandes d'immatriculation",
        },
        {
          name: 'registration.update',
          displayName: 'Modifier une demande',
          description: "Modifier les demandes d'immatriculation",
        },
        {
          name: 'registration.process',
          displayName: 'Traiter les demandes',
          description: "Traiter ou rejeter les demandes d'immatriculation",
        },
        {
          name: 'registration.upload',
          displayName: 'upload niu des demandes',
          description: "upload  des demandes d'immatriculation",
        },
        {
          name: 'registration.stats',
          displayName: 'Statistiques demandes',
          description: "Voir les statistiques des demandes d'immatriculation",
        },
      ],
      payment: [
        {
          name: 'payment.list',
          displayName: 'Lister les transactions',
          description: 'Voir la liste des transactions de paiement',
        },
        {
          name: 'payment.view',
          displayName: 'Voir une transaction',
          description: "Voir les détails d'une transaction",
        },
        {
          name: 'payment.create',
          displayName: 'Créer une transaction',
          description: 'Créer de nouvelles transactions de paiement',
        },
        {
          name: 'payment.check',
          displayName: 'Vérifier le statut',
          description: 'Vérifier le statut des transactions',
        },
        {
          name: 'payment.stats',
          displayName: 'Statistiques paiements',
          description: 'Voir les statistiques des paiements',
        },
      ],
      botuser: [
        {
          name: 'botuser.list',
          displayName: 'Lister les bot users',
          description: 'Voir la liste des utilisateurs du bot',
        },
        {
          name: 'botuser.view',
          displayName: 'Voir un bot user',
          description: "Voir les détails d'un utilisateur du bot",
        },
        {
          name: 'botuser.update',
          displayName: 'Modifier un bot user',
          description: 'Modifier les utilisateurs du bot',
        },
        {
          name: 'botuser.delete',
          displayName: 'Supprimer un bot user',
          description: 'Supprimer des utilisateurs du bot',
        },
        {
          name: 'botuser.stats',
          displayName: 'Statistiques bot users',
          description: 'Voir les statistiques des utilisateurs du bot',
        },
      ],
      reports: [
        {
          name: 'reports.view',
          displayName: 'Voir les rapports',
          description: 'Accéder aux rapports',
        },
        {
          name: 'reports.generate',
          displayName: 'Générer des rapports',
          description: 'Créer de nouveaux rapports',
        },
        {
          name: 'reports.export',
          displayName: 'Exporter les rapports',
          description: 'Exporter les rapports en différents formats',
        },
        {
          name: 'reports.schedule',
          displayName: 'Planifier des rapports',
          description: 'Planifier la génération automatique de rapports',
        },
      ],
      admin: [
        {
          name: 'admin.view_logs',
          displayName: 'Voir les logs',
          description: 'Consulter les logs système',
        },
        {
          name: 'admin.manage_settings',
          displayName: 'Gérer les paramètres',
          description: 'Modifier les paramètres système',
        },
        {
          name: 'admin.maintenance_mode',
          displayName: 'Mode maintenance',
          description: 'Activer/désactiver le mode maintenance',
        },
        {
          name: 'admin.*',
          displayName: 'Administration complète',
          description: 'Accès complet à toutes les fonctions admin',
        },
      ],
      profile: [
        {
          name: 'profile.view_own',
          displayName: 'Voir son profil',
          description: 'Voir ses propres informations',
        },
        {
          name: 'profile.update_own',
          displayName: 'Modifier son profil',
          description: 'Modifier ses propres informations',
        },
        {
          name: 'profile.change_password',
          displayName: 'Changer mot de passe',
          description: 'Modifier son propre mot de passe',
        },
      ],
    }

    // Create permissions
    const allPermissions: Permission[] = []

    for (const [module, permissions] of Object.entries(permissionsByModule)) {
      for (const permData of permissions) {
        const permission = await Permission.updateOrCreate(
          { name: permData.name },
          {
            ...permData,
            module,
          }
        )
        allPermissions.push(permission)
      }
    }

    // Assign permissions to roles
    const rolePermissions = {
      super_admin: '*', // All permissions
      admin: [
        'users.*',
        'roles.*',
        'permissions.*',
        'taxpayer.*',
        'registration.*',
        'payment.*',
        'botuser.*',
        'reports.*',
        'admin.*',
        'profile.*',
      ],
      manager: [
        'users.list',
        'users.view',
        'users.update',
        'users.assign_roles',
        'roles.list',
        'roles.view',
        'taxpayer.*',
        'registration.*',
        'payment.*',
        'botuser.*',
        'reports.*',
        'profile.*',
      ],
      operator: [
        'taxpayer.search',
        'taxpayer.export',
        'taxpayer.view_history',
        'registration.list',
        'registration.view',
        'registration.create',
        'payment.list',
        'payment.view',
        'payment.create',
        'botuser.list',
        'botuser.view',
        'reports.view',
        'reports.generate',
        'profile.*',
      ],
      viewer: [
        'users.list',
        'users.view',
        'roles.list',
        'taxpayer.search',
        'registration.list',
        'registration.view',
        'payment.list',
        'payment.view',
        'botuser.list',
        'botuser.view',
        'reports.view',
        'profile.view_own',
      ],
      user: ['profile.view_own', 'profile.update_own', 'profile.change_password'],
    }

    // Assign permissions to each role
    for (const [roleName, permissions] of Object.entries(rolePermissions)) {
      const role = await Role.findBy('name', roleName)
      if (!role) continue

      // Get permission IDs to attach
      let permissionIds: number[] = []

      if (permissions === '*') {
        // Super admin gets all permissions
        permissionIds = allPermissions.map((p) => p.id)
      } else {
        for (const permPattern of permissions) {
          if (permPattern.endsWith('.*')) {
            // Wildcard: get all permissions for this module
            const module = permPattern.slice(0, -2)
            const modulePerms = allPermissions.filter((p) => p.module === module)
            permissionIds.push(...modulePerms.map((p) => p.id))
          } else {
            // Specific permission
            const perm = allPermissions.find((p) => p.name === permPattern)
            if (perm) permissionIds.push(perm.id)
          }
        }
      }

      // Remove duplicates
      permissionIds = [...new Set(permissionIds)]

      // Sync permissions (replace existing)
      await role.related('permissions').sync(permissionIds)
    }

    console.log('✅ Permissions seeded and assigned to roles successfully')
  }
}
