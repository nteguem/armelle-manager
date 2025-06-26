import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BotSession from './bot_session.js'
import BotUser from './bot_user.js'
import type { MessageDirection, MessageType, SupportedLanguage } from '#bot/types/bot_types'

export default class BotMessage extends BaseModel {
  static table = 'bot_messages'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare sessionId: string

  @column()
  declare botUserId: string

  @column()
  declare direction: MessageDirection

  @column()
  declare messageType: MessageType

  @column()
  declare content: string

  @column({
    prepare: (value: Record<string, any>) => JSON.stringify(value),
    consume: (value: string) => JSON.parse(value),
  })
  declare structuredContent: Record<string, any>

  @column()
  declare language: SupportedLanguage

  @column({
    prepare: (value: Record<string, any>) => JSON.stringify(value),
    consume: (value: string) => JSON.parse(value),
  })
  declare rawData: Record<string, any>

  @column()
  declare channelMessageId: string | null

  @column()
  declare workflowId: string | null

  @column()
  declare stepId: string | null

  @column({
    prepare: (value: Record<string, any>) => JSON.stringify(value),
    consume: (value: string) => JSON.parse(value),
  })
  declare contextSnapshot: Record<string, any>

  @column()
  declare isProcessed: boolean

  @column.dateTime()
  declare processedAt: DateTime | null

  @column()
  declare processingError: string | null

  @column()
  declare processingDurationMs: number | null

  @column()
  declare isSystemMessage: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  /**
   * Relations
   */
  @belongsTo(() => BotSession)
  declare session: BelongsTo<typeof BotSession>

  @belongsTo(() => BotUser)
  declare botUser: BelongsTo<typeof BotUser>

  /**
   * Méthodes métier
   */

  /**
   * Marque le message comme traité avec succès
   */
  public async markAsProcessed(durationMs: number): Promise<void> {
    this.isProcessed = true
    this.processedAt = DateTime.now()
    this.processingDurationMs = durationMs
    this.processingError = null
    await this.save()
  }

  /**
   * Marque le message comme échoué avec erreur
   */
  public async markAsError(error: string, durationMs: number): Promise<void> {
    this.isProcessed = false
    this.processedAt = DateTime.now()
    this.processingError = error
    this.processingDurationMs = durationMs
    await this.save()
  }

  /**
   * Vérifie si le message est un message entrant utilisateur
   */
  public isIncoming(): boolean {
    return this.direction === 'in'
  }

  /**
   * Vérifie si le message est un message sortant bot
   */
  public isOutgoing(): boolean {
    return this.direction === 'out'
  }

  /**
   * Vérifie si le message est une commande système
   */
  public isCommand(): boolean {
    return this.messageType === 'command'
  }

  /**
   * Récupère le temps de traitement en millisecondes
   */
  public getProcessingTime(): number | null {
    return this.processingDurationMs
  }

  /**
   * Récupère le contexte workflow au moment du message
   */
  public getWorkflowContext(): {
    workflowId: string | null
    stepId: string | null
    context: Record<string, any>
  } {
    return {
      workflowId: this.workflowId,
      stepId: this.stepId,
      context: this.contextSnapshot,
    }
  }

  /**
   * Vérifie si le message contient du contenu structuré
   */
  public hasStructuredContent(): boolean {
    return Object.keys(this.structuredContent).length > 0
  }

  /**
   * Récupère les métadonnées du canal d'origine
   */
  public getChannelMetadata(): Record<string, any> {
    return this.rawData
  }

  /**
   * Crée un résumé du message pour analytics
   */
  public getSummary(): {
    id: string
    direction: MessageDirection
    type: MessageType
    length: number
    language: SupportedLanguage
    processed: boolean
    processingTime: number | null
    hasError: boolean
    workflow: string | null
    timestamp: string
  } {
    return {
      id: this.id,
      direction: this.direction,
      type: this.messageType,
      length: this.content.length,
      language: this.language,
      processed: this.isProcessed,
      processingTime: this.processingDurationMs,
      hasError: this.processingError !== null,
      workflow: this.workflowId,
      timestamp: this.createdAt.toISO()!,
    }
  }

  /**
   * Scopes de requête
   */

  /**
   * Messages entrants seulement
   */
  public static incoming() {
    return this.query().where('direction', 'in')
  }

  /**
   * Messages sortants seulement
   */
  public static outgoing() {
    return this.query().where('direction', 'out')
  }

  /**
   * Messages traités avec succès
   */
  public static processed() {
    return this.query().where('isProcessed', true)
  }

  /**
   * Messages en erreur
   */
  public static failed() {
    return this.query().whereNotNull('processingError')
  }

  /**
   * Messages système
   */
  public static system() {
    return this.query().where('isSystemMessage', true)
  }

  /**
   * Messages utilisateur
   */
  public static user() {
    return this.query().where('isSystemMessage', false)
  }

  /**
   * Messages par type
   */
  public static byType(type: MessageType) {
    return this.query().where('messageType', type)
  }

  /**
   * Messages par langue
   */
  public static byLanguage(language: SupportedLanguage) {
    return this.query().where('language', language)
  }

  /**
   * Messages par workflow
   */
  public static byWorkflow(workflowId: string) {
    return this.query().where('workflowId', workflowId)
  }

  /**
   * Messages d'une session spécifique
   */
  public static bySession(sessionId: string) {
    return this.query().where('sessionId', sessionId).orderBy('createdAt', 'asc')
  }

  /**
   * Messages récents (dernières N heures)
   */
  public static recent(hours: number = 24) {
    const since = DateTime.now().minus({ hours }).toSQL()
    return this.query().where('createdAt', '>=', since).orderBy('createdAt', 'desc')
  }

  /**
   * Messages avec temps de traitement lent
   */
  public static slowProcessing(thresholdMs: number = 5000) {
    return this.query().where('processingDurationMs', '>', thresholdMs)
  }

  /**
   * Statistiques de performance
   */
  public static async getPerformanceStats(hours: number = 24): Promise<{
    totalMessages: number
    averageProcessingTime: number
    errorRate: number
    slowMessages: number
  }> {
    const since = DateTime.now().minus({ hours }).toSQL()

    const stats = await this.query()
      .where('createdAt', '>=', since)
      .where('direction', 'in') // Seulement messages entrants
      .select([
        this.query().count('*').as('total'),
        this.query().avg('processingDurationMs').as('avgTime'),
        this.query().countDistinct('id').whereNotNull('processingError').as('errors'),
        this.query().countDistinct('id').where('processingDurationMs', '>', 5000).as('slow'),
      ])
      .first()

    const total = Number(stats?.$extras.total || 0)
    const avgTime = Number(stats?.$extras.avgTime || 0)
    const errors = Number(stats?.$extras.errors || 0)
    const slow = Number(stats?.$extras.slow || 0)

    return {
      totalMessages: total,
      averageProcessingTime: Math.round(avgTime),
      errorRate: total > 0 ? Math.round((errors / total) * 100) : 0,
      slowMessages: slow,
    }
  }
}
