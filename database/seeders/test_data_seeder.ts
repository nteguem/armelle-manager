import { BaseSeeder } from '@adonisjs/lucid/seeders'
import User from '#models/user'
import Role from '#models/role'
import Permission from '#models/permission'

export default class extends BaseSeeder {
  async run() {
    // Nettoyer les données existantes
    await User.query().delete()
    await Role.query().delete()
    await Permission.query().delete()

    console.log('🧹 Nettoyage des données existantes...')

    // 1. Créer les permissions essentielles
    const permissions = await Permission.createMany([
      {
        name: 'users.read',
        description: 'Lire les utilisateurs',
        module: 'users',
        category: 'read',
      },
      {
        name: 'users.write',
        description: 'Créer et modifier les utilisateurs',
        module: 'users',
        category: 'write',
      },
      {
        name: 'users.delete',
        description: 'Supprimer les utilisateurs',
        module: 'users',
        category: 'delete',
      },
      { name: 'roles.read', description: 'Lire les rôles', module: 'roles', category: 'read' },
      {
        name: 'roles.write',
        description: 'Créer et modifier les rôles',
        module: 'roles',
        category: 'write',
      },
      {
        name: 'roles.delete',
        description: 'Supprimer les rôles',
        module: 'roles',
        category: 'delete',
      },
      {
        name: 'system.admin',
        description: 'Administration complète',
        module: 'system',
        category: 'admin',
      },
    ])

    console.log('✅ Permissions créées')

    // 2. Créer le rôle Super Admin
    const superAdminRole = await Role.create({
      name: 'super_admin',
      displayName: 'Super Administrateur',
      description: 'Accès complet au système - peut tout faire',
      status: 'active',
    })

    // 3. Attacher toutes les permissions au rôle
    await superAdminRole.related('permissions').attach(
      permissions.reduce(
        (acc, permission) => {
          acc[permission.id] = {}
          return acc
        },
        {} as Record<number, any>
      )
    )

    console.log('✅ Rôle Super Admin créé avec toutes les permissions')

    // 4. Créer l'utilisateur de test
    const testUser = await User.create({
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'Admin',
      password: 'password123',
      status: 'active',
      roleId: superAdminRole.id,
      loginCount: 0,
    })

    console.log('✅ Utilisateur de test créé')
    console.log('')
    console.log('🎉 DONNÉES DE TEST PRÊTES')
    console.log('📧 Email: test@example.com')
    console.log('🔑 Password: password123')
    console.log('👑 Rôle: Super Administrateur (peut tout faire)')
    console.log('')
    console.log('🚀 Tu peux maintenant :')
    console.log('   1. Lancer le serveur: npm run dev')
    console.log('   2. Tester dans Postman avec ces identifiants')
    console.log("   3. Accéder à tous les endpoints de l'API")
  }
}
