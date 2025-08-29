import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/rest-api/user'
import Permission from '#models/rest-api/permission'

export default class UserPermission extends BaseModel {
  public static table = 'user_permissions'

  // Pas de primaryKey défini = Lucid utilisera la contrainte composite de la DB
  public static selfAssignPrimaryKey = false

  @column({ isPrimary: true, columnName: 'user_id' })
  declare userId: number

  @column({ isPrimary: true, columnName: 'permission_id' })
  declare permissionId: number

  @column({ columnName: 'granted_by' })
  declare grantedBy: number | null

  @column.dateTime({ columnName: 'granted_at' })
  declare grantedAt: DateTime

  @column.dateTime({ columnName: 'expires_at' })
  declare expiresAt: DateTime | null

  /**
   * Relationship to User
   */
  @belongsTo(() => User, {
    foreignKey: 'userId',
  })
  declare user: BelongsTo<typeof User>

  /**
   * Relationship to Permission
   */
  @belongsTo(() => Permission, {
    foreignKey: 'permissionId',
  })
  declare permission: BelongsTo<typeof Permission>

  /**
   * Relationship to User who granted the permission
   */
  @belongsTo(() => User, {
    foreignKey: 'grantedBy',
  })
  declare grantedByUser: BelongsTo<typeof User>

  /**
   * Check if the permission has expired
   */
  get isExpired(): boolean {
    if (!this.expiresAt) return false
    return DateTime.now() > this.expiresAt
  }

  /**
   * Check if the permission is active
   */
  get isActive(): boolean {
    return !this.isExpired
  }

  /**
   * Scope pour obtenir les permissions actives
   */
  public static activePermissions = (query: any) => {
    return query.where((subQuery: any) => {
      subQuery.whereNull('expires_at').orWhere('expires_at', '>', DateTime.now().toSQL())
    })
  }

  /**
   * Scope pour obtenir les permissions expirées
   */
  public static expiredPermissions = (query: any) => {
    return query.whereNotNull('expires_at').where('expires_at', '<=', DateTime.now().toSQL())
  }

  /**
   * Méthode helper pour trouver une permission spécifique
   */
  public static async findByUserAndPermission(
    userId: number,
    permissionId: number
  ): Promise<UserPermission | null> {
    return await this.query().where('user_id', userId).where('permission_id', permissionId).first()
  }
}
