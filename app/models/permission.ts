import { DateTime } from 'luxon'
import { BaseModel, column, manyToMany } from '@adonisjs/lucid/orm'
import type { ManyToMany } from '@adonisjs/lucid/types/relations'
import Role from '#models/role'
import User from '#models/user'

export default class Permission extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare displayName: string

  @column()
  declare description: string | null

  @column()
  declare module: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /**
   * Many-to-many relationship with roles
   */
  @manyToMany(() => Role, {
    localKey: 'id',
    pivotForeignKey: 'permission_id',
    relatedKey: 'id',
    pivotRelatedForeignKey: 'role_id',
    pivotTable: 'role_permissions',
    pivotTimestamps: true,
  })
  declare roles: ManyToMany<typeof Role>

  /**
   * Many-to-many relationship with users (direct permissions)
   */
  @manyToMany(() => User, {
    localKey: 'id',
    pivotForeignKey: 'permission_id',
    relatedKey: 'id',
    pivotRelatedForeignKey: 'user_id',
    pivotTable: 'user_permissions',
    pivotTimestamps: {
      createdAt: 'granted_at',
      updatedAt: false,
    },
    pivotColumns: ['granted_by', 'expires_at'],
  })
  declare users: ManyToMany<typeof User>

  /**
   * Get all permissions grouped by module
   */
  static async getGroupedByModule(): Promise<Record<string, Permission[]>> {
    const permissions = await this.query().orderBy('module', 'asc').orderBy('name', 'asc')

    return permissions.reduce(
      (grouped, permission) => {
        if (!grouped[permission.module]) {
          grouped[permission.module] = []
        }
        grouped[permission.module].push(permission)
        return grouped
      },
      {} as Record<string, Permission[]>
    )
  }

  /**
   * Parse permission name to get module and action
   */
  static parsePermissionName(name: string): { module: string; action: string } {
    const parts = name.split('.')
    return {
      module: parts[0] || '',
      action: parts[1] || '',
    }
  }
}
