import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Permission from '#models/permission'

export default class UserPermission extends BaseModel {
  @column()
  declare userId: number

  @column()
  declare permissionId: number

  @column()
  declare grantedBy: number | null

  @column.dateTime()
  declare grantedAt: DateTime

  @column.dateTime()
  declare expiresAt: DateTime | null

  /**
   * Relationship to User
   */
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  /**
   * Relationship to Permission
   */
  @belongsTo(() => Permission)
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
}
