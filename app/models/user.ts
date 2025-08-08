import { DateTime } from 'luxon'
import { BaseModel, column, manyToMany, hasMany } from '@adonisjs/lucid/orm'
import type { ManyToMany, HasMany } from '@adonisjs/lucid/types/relations'
import Role from '#models/role'
import Permission from '#models/permission'
import UserRole from '#models/user_role'
import UserPermission from '#models/user_permission'
import Taxpayer from './tax_payer.js'
import UserTaxpayer from './user_taxpayers.js'

export default class User extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare nellysCoinId: string | number

  @column()
  declare username: string | null

  @column()
  declare email: string | null

  @column()
  declare canAccessPanel: boolean

  @column()
  declare token: string | null

  @column()
  declare refreshToken: string | null

  @column.dateTime()
  declare tokenExpiresAt: DateTime | null

  @column({
    prepare: (value: any) => JSON.stringify(value),
    consume: (value: any) => {
      try {
        return typeof value === 'string' ? JSON.parse(value) : value
      } catch {
        return value
      }
    },
  })
  declare metadata: any

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @manyToMany(() => Role, {
    localKey: 'id',
    pivotForeignKey: 'user_id',
    relatedKey: 'id',
    pivotRelatedForeignKey: 'role_id',
    pivotTable: 'user_roles',
    pivotTimestamps: {
      createdAt: 'assigned_at',
      updatedAt: false,
    },
    pivotColumns: ['assigned_by', 'expires_at'],
  })
  declare roles: ManyToMany<typeof Role>

  @manyToMany(() => Permission, {
    localKey: 'id',
    pivotForeignKey: 'user_id',
    relatedKey: 'id',
    pivotRelatedForeignKey: 'permission_id',
    pivotTable: 'user_permissions',
    pivotTimestamps: {
      createdAt: 'granted_at',
      updatedAt: false,
    },
    pivotColumns: ['granted_by', 'expires_at'],
  })
  declare permissions: ManyToMany<typeof Permission>

  @hasMany(() => UserRole)
  declare userRoles: HasMany<typeof UserRole>

  @hasMany(() => UserPermission)
  declare userPermissions: HasMany<typeof UserPermission>

  @hasMany(() => Taxpayer, {
    foreignKey: 'createdById',
  })
  declare createdTaxpayers: HasMany<typeof Taxpayer>

  @manyToMany(() => Taxpayer, {
    localKey: 'id',
    pivotForeignKey: 'user_id',
    relatedKey: 'id',
    pivotRelatedForeignKey: 'taxpayer_id',
    pivotTable: 'user_taxpayers',
    pivotTimestamps: {
      createdAt: 'assigned_at',
      updatedAt: 'updated_at',
    },
    pivotColumns: ['relationship_type'],
  })
  declare taxpayers: ManyToMany<typeof Taxpayer>

  @hasMany(() => UserTaxpayer, { foreignKey: 'userId' })
  declare taxpayerRelations: HasMany<typeof UserTaxpayer>

  async hasRole(roleName: string): Promise<boolean> {
    const user = this as User & { roles?: Role[] }

    if (!user.roles) {
      await this.load('roles' as any)
    }

    return user.roles!.some(
      (role) =>
        role.name === roleName &&
        role.isActive &&
        (!role.$extras.pivot?.expires_at ||
          DateTime.fromISO(role.$extras.pivot.expires_at) > DateTime.now())
    )
  }

  async hasPermission(permissionName: string): Promise<boolean> {
    const user = this as User & { roles?: Role[]; permissions?: Permission[] }

    if (!user.roles) {
      await this.load('roles' as any, (query) => {
        query.preload('permissions' as any)
      })
    }
    if (!user.permissions) {
      await this.load('permissions' as any)
    }

    const hasDirectPermission = user.permissions!.some((permission) => {
      const pivot = permission.$extras.pivot
      const notExpired = !pivot?.expires_at || DateTime.fromISO(pivot.expires_at) > DateTime.now()
      return permission.name === permissionName && notExpired
    })

    if (hasDirectPermission) return true

    for (const role of user.roles!) {
      if (!role.isActive) continue

      const rolePivot = role.$extras.pivot
      if (rolePivot?.expires_at && DateTime.fromISO(rolePivot.expires_at) < DateTime.now()) {
        continue
      }

      const rolePermissions = (role as any).permissions as Permission[] | undefined
      if (rolePermissions?.some((p) => p.name === permissionName)) {
        return true
      }
    }

    const parts = permissionName.split('.')
    if (parts.length > 1) {
      return this.hasPermission(`${parts[0]}.*`)
    }

    return false
  }

  async getAllPermissions(): Promise<string[]> {
    const permissions = new Set<string>()
    const user = this as User & { roles?: Role[]; permissions?: Permission[] }

    if (!user.roles) {
      await this.load('roles' as any, (query) => {
        query.preload('permissions' as any)
      })
    }
    if (!user.permissions) {
      await this.load('permissions' as any)
    }

    for (const role of user.roles!) {
      if (!role.isActive) continue

      const rolePivot = role.$extras.pivot
      if (rolePivot?.expires_at && DateTime.fromISO(rolePivot.expires_at) < DateTime.now()) {
        continue
      }

      const rolePermissions = (role as any).permissions as Permission[] | undefined
      rolePermissions?.forEach((p) => permissions.add(p.name))
    }

    for (const permission of user.permissions!) {
      const pivot = permission.$extras.pivot
      if (!pivot?.expires_at || DateTime.fromISO(pivot.expires_at) > DateTime.now()) {
        permissions.add(permission.name)
      }
    }

    return Array.from(permissions)
  }

  async getActiveRoles(): Promise<Role[]> {
    const user = this as User & { roles?: Role[] }

    if (!user.roles) {
      await this.load('roles' as any)
    }

    return user.roles!.filter((role) => {
      if (!role.isActive) return false

      const pivot = role.$extras.pivot
      if (pivot?.expires_at && DateTime.fromISO(pivot.expires_at) < DateTime.now()) {
        return false
      }

      return true
    })
  }
}
