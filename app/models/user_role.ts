import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Role from '#models/role'

export default class UserRole extends BaseModel {
  /**
   * Indique que la clé primaire n'est pas une colonne `id`
   */
  public static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare userId: number

  @column({ isPrimary: true })
  declare roleId: number

  @column()
  declare assigned_by: number | null

  @column.dateTime()
  declare assigned_at: DateTime

  @column.dateTime()
  declare expires_at: DateTime | null

  /**
   * Relation vers l'utilisateur concerné
   */
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  /**
   * Relation vers le rôle attribué
   */
  @belongsTo(() => Role)
  declare role: BelongsTo<typeof Role>

  /**
   * Relation vers l'utilisateur qui a attribué le rôle
   */
  @belongsTo(() => User, {
    foreignKey: 'assignedBy',
  })
  declare assignedByUser: BelongsTo<typeof User>

  /**
   * Vérifie si l'attribution du rôle est expirée
   */
  get isExpired(): boolean {
    if (!this.expires_at) return false
    return DateTime.now() > this.expires_at
  }

  /**
   * Vérifie si l'attribution du rôle est encore active
   */
  get isActive(): boolean {
    return !this.isExpired
  }
}
