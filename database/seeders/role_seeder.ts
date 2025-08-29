import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Role from '#models/rest-api/role'

export default class extends BaseSeeder {
  async run() {
    // Define default roles
    const roles = [
      {
        name: 'super_admin',
        displayName: 'Super Administrateur',
        description: 'Accès complet au système avec toutes les permissions',
        isActive: true,
      },
      {
        name: 'admin',
        displayName: 'Administrateur',
        description: 'Accès administratif avec gestion des utilisateurs et configurations',
        isActive: true,
      },
      {
        name: 'manager',
        displayName: 'Manager',
        description: 'Gestion des opérations et supervision des équipes',
        isActive: true,
      },
      {
        name: 'operator',
        displayName: 'Opérateur',
        description: 'Accès aux fonctionnalités opérationnelles (DGI, rapports)',
        isActive: true,
      },
      {
        name: 'viewer',
        displayName: 'Observateur',
        description: 'Accès en lecture seule aux données',
        isActive: true,
      },
      {
        name: 'user',
        displayName: 'Utilisateur',
        description: 'Utilisateur standard avec accès limité',
        isActive: true,
      },
    ]

    // Create or update roles
    for (const roleData of roles) {
      await Role.updateOrCreate({ name: roleData.name }, roleData)
    }

    console.log('✅ Roles seeded successfully')
  }
}
