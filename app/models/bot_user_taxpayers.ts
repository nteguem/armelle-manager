// app/models/bot_user_taxpayer.ts
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BotUser from './bot_user.js'
import Taxpayer from './tax_payer.js'

export default class BotUserTaxpayer extends BaseModel {
  static table = 'bot_user_taxpayers'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare botUserId: string

  @column()
  declare taxpayerId: string

  @column()
  declare relationshipType: 'owner' | 'linked'

  @column.dateTime({ autoCreate: true })
  declare linkedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations pour les requêtes
  @belongsTo(() => BotUser, { foreignKey: 'botUserId' })
  declare botUser: BelongsTo<typeof BotUser>

  @belongsTo(() => Taxpayer, { foreignKey: 'taxpayerId' })
  declare taxpayer: BelongsTo<typeof Taxpayer>
}
