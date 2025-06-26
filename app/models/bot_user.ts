import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import BotSession from './bot_session.js'
import BotMessage from './bot_message.js'
import type { SupportedLanguage, MessageChannel } from '#bot/types/bot_types'

export default class BotUser extends BaseModel {
  static table = 'bot_users'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare phoneNumber: string

  @column()
  declare fullName: string

  @column()
  declare language: SupportedLanguage

  @column()
  declare isActive: boolean

  @column()
  declare isVerified: boolean

  @column({
    prepare: (value: Record<string, any>) => JSON.stringify(value),
    consume: (value: string) => JSON.parse(value),
  })
  declare preferences: Record<string, any>

  @column.dateTime()
  declare lastInteractionAt: DateTime | null

  @column()
  declare totalMessages: number

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

  /**
   * Méthodes métier
   */

  /**
   * Vérifie si l'utilisateur peut interagir avec le bot
   */
  public canInteract(): boolean {
    return this.isActive
  }

  /**
   * Vérifie si l'utilisateur a terminé l'onboarding
   */
  public hasCompletedOnboarding(): boolean {
    return this.isVerified
  }

  /**
   * Met à jour la dernière interaction
   */
  public async updateLastInteraction(): Promise<void> {
    this.lastInteractionAt = DateTime.now()
    this.totalMessages += 1
    await this.save()
  }

  /**
   * Change la langue préférée
   */
  public async setLanguage(language: SupportedLanguage): Promise<void> {
    this.language = language
    await this.save()
  }

  /**
   * Bloque l'utilisateur (modération automatique)
   */
  public async block(reason?: string): Promise<void> {
    this.isActive = false
    if (reason) {
      this.preferences = {
        ...this.preferences,
        blockReason: reason,
        blockedAt: DateTime.now().toISO(),
      }
    }
    await this.save()
  }

  /**
   * Débloque l'utilisateur
   */
  public async unblock(): Promise<void> {
    this.isActive = true
    this.preferences = {
      ...this.preferences,
      blockReason: null,
      unblockedAt: DateTime.now().toISO(),
    }
    await this.save()
  }

  /**
   * Marque l'utilisateur comme vérifié (fin onboarding)
   */
  public async markAsVerified(): Promise<void> {
    this.isVerified = true
    this.preferences = {
      ...this.preferences,
      verifiedAt: DateTime.now().toISO(),
    }
    await this.save()
  }

  /**
   * Récupère les statistiques de l'utilisateur
   */
  public async getStats(): Promise<{
    totalMessages: number
    sessionsCount: number
    daysSinceRegistration: number
    isNewUser: boolean
  }> {
    const sessionsQuery = await BotSession.query().where('botUserId', this.id).count('* as total')
    const sessionsCount = Number(sessionsQuery[0].$extras.total)

    const daysSinceRegistration = Math.floor(DateTime.now().diff(this.createdAt, 'days').days)

    return {
      totalMessages: this.totalMessages,
      sessionsCount,
      daysSinceRegistration,
      isNewUser: daysSinceRegistration < 7,
    }
  }

  /**
   * Scopes de requête
   */

  /**
   * Utilisateurs actifs seulement
   */
  public static active() {
    return this.query().where('isActive', true)
  }

  /**
   * Utilisateurs vérifiés seulement
   */
  public static verified() {
    return this.query().where('isVerified', true)
  }

  /**
   * Utilisateurs par langue
   */
  public static byLanguage(language: SupportedLanguage) {
    return this.query().where('language', language)
  }

  /**
   * Utilisateurs par canal d'inscription
   */
  public static byRegistrationChannel(channel: MessageChannel) {
    return this.query().where('registrationChannel', channel)
  }

  /**
   * Recherche par numéro de téléphone
   */
  public static findByPhone(phoneNumber: string) {
    return this.query().where('phoneNumber', phoneNumber).first()
  }
}
