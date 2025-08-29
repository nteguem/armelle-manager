import { DateTime } from 'luxon'
import { BaseModel, column, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import type { HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import BotSession from './bot_session.js'
import BotMessage from './bot_message.js'
import Taxpayer from '../rest-api/tax_payer.js'
import BotUserTaxpayer from './bot_user_taxpayers.js'

export default class BotUser extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare phoneNumber: string

  @column()
  declare fullName: string | null

  @column()
  declare language: 'fr' | 'en'

  @column()
  declare isActive: boolean

  @column()
  declare isVerified: boolean

  @column()
  declare registrationChannel: string

  @column()
  declare metadata: Record<string, any>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @hasMany(() => BotSession)
  declare sessions: HasMany<typeof BotSession>

  @hasMany(() => BotMessage)
  declare messages: HasMany<typeof BotMessage>

  @hasMany(() => Taxpayer, {
    foreignKey: 'createdById',
  })
  declare createdTaxpayers: HasMany<typeof Taxpayer>

  @manyToMany(() => Taxpayer, {
    localKey: 'id',
    pivotForeignKey: 'bot_user_id',
    relatedKey: 'id',
    pivotRelatedForeignKey: 'taxpayer_id',
    pivotTable: 'bot_user_taxpayers',
    pivotTimestamps: {
      createdAt: 'linked_at',
      updatedAt: 'updated_at',
    },
    pivotColumns: ['relationship_type'],
  })
  declare taxpayers: ManyToMany<typeof Taxpayer>

  @hasMany(() => BotUserTaxpayer, { foreignKey: 'botUserId' })
  declare taxpayerRelations: HasMany<typeof BotUserTaxpayer>

  public get displayName(): string {
    return this.fullName || this.phoneNumber
  }

  public async getCurrentSession(channel: string): Promise<BotSession | null> {
    return await BotSession.query()
      .where('botUserId', this.id)
      .where('channel', channel)
      .where('isActive', true)
      .orderBy('updatedAt', 'desc')
      .first()
  }

  public async createSession(channel: string, channelUserId: string): Promise<BotSession> {
    return await BotSession.create({
      botUserId: this.id,
      channel,
      channelUserId,
      currentContext: {},
      isActive: true,
      messageCount: 0,
    })
  }

  public async markAsVerified(): Promise<void> {
    this.isVerified = true
    await this.save()
  }

  public async updateLanguage(language: 'fr' | 'en'): Promise<void> {
    this.language = language
    await this.save()
  }

  public async updateMetadata(key: string, value: any): Promise<void> {
    this.metadata = {
      ...this.metadata,
      [key]: value,
    }
    await this.save()
  }

  public static verified() {
    return this.query().where('isVerified', true)
  }

  public static active() {
    return this.query().where('isActive', true)
  }

  public static byChannel(channel: string) {
    return this.query().where('registrationChannel', channel)
  }

  public static byLanguage(language: 'fr' | 'en') {
    return this.query().where('language', language)
  }
}
