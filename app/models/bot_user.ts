import { DateTime } from 'luxon'
import { BaseModel, column, hasMany, belongsTo } from '@adonisjs/lucid/orm'
import type { HasMany, BelongsTo } from '@adonisjs/lucid/types/relations'
import BotSession from './bot_session.js'
import BotMessage from './bot_message.js'
import Taxpayer from './tax_payer.js'

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
  declare taxpayerId: string | null

  @column()
  declare registrationChannel: string

  @column()
  declare metadata: Record<string, any>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @hasMany(() => BotSession)
  declare sessions: HasMany<typeof BotSession>

  @hasMany(() => BotMessage)
  declare messages: HasMany<typeof BotMessage>

  @belongsTo(() => Taxpayer)
  declare taxpayer: BelongsTo<typeof Taxpayer>

  // Méthodes utilitaires
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
      persistentContext: {},
      navigationStack: [],
      workflowHistory: {},
      activeWorkflows: [],
    })
  }

  public async markAsVerified(): Promise<void> {
    this.isVerified = true
    await this.save()
  }

  public async linkTaxpayer(taxpayerId: string): Promise<void> {
    this.taxpayerId = taxpayerId
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

  public static withTaxpayer() {
    return this.query().whereNotNull('taxpayerId')
  }
}
