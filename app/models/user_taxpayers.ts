import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import Taxpayer from './tax_payer.js'

export default class UserTaxpayer extends BaseModel {
  static table = 'user_taxpayers'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare userId: string

  @column()
  declare taxpayerId: string

  @column()
  declare relationshipType: 'creator' | 'manager'

  @column.dateTime({ autoCreate: true })
  declare assignedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations pour les requêtes
  @belongsTo(() => User, { foreignKey: 'userId' })
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Taxpayer, { foreignKey: 'taxpayerId' })
  declare taxpayer: BelongsTo<typeof Taxpayer>
}
