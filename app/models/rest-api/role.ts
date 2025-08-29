import { DateTime } from 'luxon'
import { BaseModel, column, manyToMany } from '@adonisjs/lucid/orm'
import type { ManyToMany } from '@adonisjs/lucid/types/relations'
import Permission from '#models/rest-api/permission'
import User from '#models/rest-api/user'

export default class Role extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare displayName: string

  @column()
  declare description: string | null

  @column()
  declare isActive: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /**
   * Many-to-many relationship with permissions
   */
  @manyToMany(() => Permission, {
    localKey: 'id',
    pivotForeignKey: 'role_id',
    relatedKey: 'id',
    pivotRelatedForeignKey: 'permission_id',
    pivotTable: 'role_permissions',
    pivotTimestamps: true,
  })
  declare permissions: ManyToMany<typeof Permission>

  /**
   * Many-to-many relationship with users
   */
  @manyToMany(() => User, {
    localKey: 'id',
    pivotForeignKey: 'role_id',
    relatedKey: 'id',
    pivotRelatedForeignKey: 'user_id',
    pivotTable: 'user_roles',
    pivotTimestamps: {
      createdAt: 'assigned_at',
      updatedAt: false,
    },
    pivotColumns: ['assigned_by', 'expires_at'],
  })
  declare users: ManyToMany<typeof User>

  /**
   * Check if role has a specific permission
   */
  async hasPermission(permissionName: string): Promise<boolean> {
    const permission = await Permission.query()
      .where('name', permissionName)
      .whereHas('roles', (roleQuery) => {
        roleQuery.where('id', this.id)
      })
      .first()

    return !!permission
  }

  /**
   * Get all permission names for this role
   */
  async getPermissionNames(): Promise<string[]> {
    const roleWithPermissions = await Role.query()
      .where('id', this.id)
      .preload('permissions')
      .firstOrFail()

    return roleWithPermissions.permissions.map((permission) => permission.name)
  }
}
