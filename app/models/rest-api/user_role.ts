import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/rest-api/user'
import Role from '#models/rest-api/role'

export default class UserRole extends BaseModel {
  public static table = 'user_roles'

  // Pas de primaryKey défini = Lucid utilisera la contrainte composite de la DB
  public static selfAssignPrimaryKey = false

  @column({ isPrimary: true, columnName: 'user_id' })
  declare userId: number

  @column({ isPrimary: true, columnName: 'role_id' })
  declare roleId: number

  @column({ columnName: 'assigned_by' })
  declare assignedBy: number | null

  @column.dateTime({ columnName: 'assigned_at' })
  declare assignedAt: DateTime

  @column.dateTime({ columnName: 'expires_at' })
  declare expiresAt: DateTime | null

  /**
   * Relation vers l'utilisateur concerné
   */
  @belongsTo(() => User, {
    foreignKey: 'userId',
  })
  declare user: BelongsTo<typeof User>

  /**
   * Relation vers le rôle attribué
   */
  @belongsTo(() => Role, {
    foreignKey: 'roleId',
  })
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
    if (!this.expiresAt) return false
    return DateTime.now() > this.expiresAt
  }

  /**
   * Vérifie si l'attribution du rôle est encore active
   */
  get isActive(): boolean {
    return !this.isExpired
  }

  /**
   * Scope pour obtenir les attributions actives
   */
  public static activeAssignments = (query: any) => {
    return query.where((subQuery: any) => {
      subQuery.whereNull('expires_at').orWhere('expires_at', '>', DateTime.now().toSQL())
    })
  }

  /**
   * Scope pour obtenir les attributions expirées
   */
  public static expiredAssignments = (query: any) => {
    return query.whereNotNull('expires_at').where('expires_at', '<=', DateTime.now().toSQL())
  }

  /**
   * Méthode helper pour trouver une attribution spécifique
   */
  public static async findByUserAndRole(userId: number, roleId: number): Promise<UserRole | null> {
    return await this.query().where('user_id', userId).where('role_id', roleId).first()
  }
}
