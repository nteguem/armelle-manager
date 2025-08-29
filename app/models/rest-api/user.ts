import { DateTime } from 'luxon'
import { BaseModel, column, manyToMany, hasMany } from '@adonisjs/lucid/orm'
import type { ManyToMany, HasMany } from '@adonisjs/lucid/types/relations'
import Role from '#models/rest-api/role'
import Permission from '#models/rest-api/permission'
import UserRole from '#models/rest-api/user_role'
import UserPermission from '#models/rest-api/user_permission'
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

  // ==========================================
  // NOUVELLES MÉTHODES - DÉLÉGATION AU SERVICE
  // ==========================================

  /**
   * Check if user has a specific role
   * @param roleName - Name of the role to check
   */
  async hasRole(roleName: string): Promise<boolean> {
    const { default: PermissionService } = await import('#services/permission_service')
    const permissionService = new PermissionService()
    return permissionService.userHasRole(this.id, roleName)
  }

  /**
   * Check if user has a specific permission
   * @param permissionName - Name of the permission to check
   */
  async hasPermission(permissionName: string): Promise<boolean> {
    const { default: PermissionService } = await import('#services/permission_service')
    const permissionService = new PermissionService()
    return permissionService.userHasPermission(this.id, permissionName)
  }

  /**
   * Get all permission names for this user
   */
  async getAllPermissions(): Promise<string[]> {
    const { default: PermissionService } = await import('#services/permission_service')
    const permissionService = new PermissionService()
    return permissionService.getUserPermissions(this.id)
  }

  /**
   * Get active roles for this user
   */
  async getActiveRoles(): Promise<Role[]> {
    const { default: PermissionService } = await import('#services/permission_service')
    const permissionService = new PermissionService()
    return permissionService.getUserActiveRoles(this.id)
  }

  // ==========================================
  // MÉTHODES UTILITAIRES (RESTENT DANS LE MODÈLE)
  // ==========================================

  /**
   * Check if user can access admin panel
   */
  get canAccessAdminPanel(): boolean {
    return this.canAccessPanel
  }

  /**
   * Check if user has valid token
   */
  get hasValidToken(): boolean {
    if (!this.token || !this.tokenExpiresAt) return false
    return DateTime.now() < this.tokenExpiresAt
  }

  /**
   * Get user display name (username or email)
   */
  get displayName(): string {
    return this.username || this.email || `User ${this.id}`
  }

  /**
   * Scope to get users with panel access
   */
  public static withPanelAccess = (query: any) => {
    return query.where('can_access_panel', true)
  }

  /**
   * Scope to get users with valid tokens
   */
  public static withValidTokens = (query: any) => {
    return query
      .whereNotNull('token')
      .whereNotNull('token_expires_at')
      .where('token_expires_at', '>', DateTime.now().toSQL())
  }
}
