import { BaseSeeder } from '@adonisjs/lucid/seeders'
import User from '#models/user'
import Role from '#models/role'
import Permission from '#models/permission'

export default class extends BaseSeeder {
  async run() {
    // Nettoyer toutes les données existantes
    await User.query().delete()
    await Role.query().delete()
    await Permission.query().delete()

    console.log('🧹 Nettoyage des données existantes...')

    // 1. Créer quelques permissions essentielles
    const permissions = await Permission.createMany([
      {
        name: 'users.read',
        description: 'Lire les utilisateurs',
        module: 'users',
        category: 'read',
      },
      {
        name: 'users.write',
        description: 'Gérer les utilisateurs',
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
      { name: 'roles.write', description: 'Gérer les rôles', module: 'roles', category: 'write' },
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
      description: 'Accès complet au système',
      status: 'active',
    })

    // 3. Attacher toutes les permissions au rôle
    const permissionMap: Record<number, any> = {}
    permissions.forEach((permission) => {
      permissionMap[permission.id] = {}
    })
    await superAdminRole.related('permissions').attach(permissionMap)

    console.log('✅ Rôle Super Admin créé')

    // 4. Créer UN SEUL utilisateur super admin
    await User.create({
      email: 'admin@armelle.com',
      firstName: 'Super',
      lastName: 'Admin',
      password: 'Admin123!',
      status: 'active',
      roleId: superAdminRole.id,
      loginCount: 0,
    })

    console.log('✅ Super utilisateur créé')
    console.log('')
    console.log('🎉 SUPER ADMIN CRÉÉ')
    console.log('📧 Email: admin@armelle.com')
    console.log('🔑 Password: Admin123!')
    console.log('👑 Rôle: Super Administrateur')
    console.log('')
    console.log('🚀 Tu peux maintenant te connecter avec ces identifiants')
  }
}
