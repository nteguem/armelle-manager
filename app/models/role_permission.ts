import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Role from '#models/role'
import Permission from '#models/permission'

export default class RolePermission extends BaseModel {
  @column()
  declare roleId: number

  @column()
  declare permissionId: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /**
   * Relationship to Role
   */
  @belongsTo(() => Role)
  declare role: BelongsTo<typeof Role>

  /**
   * Relationship to Permission
   */
  @belongsTo(() => Permission)
  declare permission: BelongsTo<typeof Permission>
}
