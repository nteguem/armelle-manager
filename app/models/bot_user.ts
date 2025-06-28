import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany, BelongsTo } from '@adonisjs/lucid/types/relations'
import BotSession from './bot_session.js'
import BotMessage from './bot_message.js'
import type { SupportedLanguage, MessageChannel } from '#bot/types/bot_types'
import Taxpayer from './tax_payer.js'

export default class BotUser extends BaseModel {
  static table = 'bot_users'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare phoneNumber: string

  @column()
  declare fullName: string | null

  @column()
  declare language: SupportedLanguage

  @column()
  declare isActive: boolean

  @column()
  declare isVerified: boolean

  @column()
  declare taxpayerId: string | null

  @column()
  declare registrationChannel: MessageChannel

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /**
   * Relations
   */
  @hasMany(() => BotSession)
  declare sessions: HasMany<typeof BotSession>

  @hasMany(() => BotMessage)
  declare messages: HasMany<typeof BotMessage>

  @belongsTo(() => Taxpayer)
  declare taxpayer: BelongsTo<typeof Taxpayer>

  public canInteract(): boolean {
    return this.isActive
  }

  public hasCompletedOnboarding(): boolean {
    return this.isVerified
  }

  public async setLanguage(language: SupportedLanguage): Promise<void> {
    this.language = language
    await this.save()
  }

  public async block(): Promise<void> {
    this.isActive = false
    await this.save()
  }

  public async unblock(): Promise<void> {
    this.isActive = true
    await this.save()
  }

  public async markAsVerified(): Promise<void> {
    this.isVerified = true
    await this.save()
  }

  public async getStats(): Promise<{
    totalMessages: number
    sessionsCount: number
    daysSinceRegistration: number
    isNewUser: boolean
    lastInteraction: DateTime | null
  }> {
    const sessionsQuery = await BotSession.query().where('botUserId', this.id).count('* as total')
    const sessionsCount = Number(sessionsQuery[0].$extras.total)

    // Compter les messages via les sessions
    const messagesQuery = await BotMessage.query().where('botUserId', this.id).count('* as total')
    const totalMessages = Number(messagesQuery[0].$extras.total)

    // Dernière interaction via la session la plus récente
    const lastSession = await BotSession.query()
      .where('botUserId', this.id)
      .orderBy('lastInteractionAt', 'desc')
      .first()

    const daysSinceRegistration = Math.floor(DateTime.now().diff(this.createdAt, 'days').days)

    return {
      totalMessages,
      sessionsCount,
      daysSinceRegistration,
      isNewUser: daysSinceRegistration < 7,
      lastInteraction: lastSession?.lastInteractionAt || null,
    }
  }

  public static active() {
    return this.query().where('isActive', true)
  }

  public static verified() {
    return this.query().where('isVerified', true)
  }

  public static byLanguage(language: SupportedLanguage) {
    return this.query().where('language', language)
  }

  public static byRegistrationChannel(channel: MessageChannel) {
    return this.query().where('registrationChannel', channel)
  }

  public static findByPhone(phoneNumber: string) {
    return this.query().where('phoneNumber', phoneNumber).first()
  }
}
