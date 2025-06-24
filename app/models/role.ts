import { DateTime } from 'luxon'
import { BaseModel, column, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import type { HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Permission from '#models/permission'

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
  declare status: 'active' | 'inactive'

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @hasMany(() => User)
  declare users: HasMany<typeof User>

  @manyToMany(() => Permission, {
    pivotTable: 'role_permissions',
  })
  declare permissions: ManyToMany<typeof Permission>

  // Méthodes simplifiées
  public async hasPermission(permission: string): Promise<boolean> {
    const roleWithPermissions = await Role.query()
      .where('id', this.id)
      .preload('permissions')
      .first()

    if (!roleWithPermissions) return false
    return roleWithPermissions.permissions.some((perm) => perm.name === permission)
  }

  public async getUsersCount(): Promise<number> {
    const result = await User.query().where('roleId', this.id).count('* as total')
    return Number(result[0].$extras.total)
  }
}
