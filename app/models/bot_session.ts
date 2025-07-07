import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import BotUser from './bot_user.js'
import BotMessage from './bot_message.js'

export default class BotSession extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare botUserId: string

  @column()
  declare channel: string

  @column()
  declare channelUserId: string

  @column()
  declare currentWorkflow: string | null

  @column()
  declare currentStep: string | null

  @column()
  declare currentContext: Record<string, any>

  @column()
  declare isActive: boolean

  @column.dateTime()
  declare lastInteractionAt: DateTime | null

  @column()
  declare messageCount: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => BotUser)
  declare botUser: BelongsTo<typeof BotUser>

  @hasMany(() => BotMessage)
  declare messages: HasMany<typeof BotMessage>

  // Méthodes de gestion du contexte
  public updateCurrentContext(data: Record<string, any>): void {
    this.currentContext = {
      ...this.currentContext,
      ...data,
    }
  }

  public clearCurrentContext(): void {
    this.currentContext = {}
  }

  // Méthodes de workflow
  public async startWorkflow(workflowId: string, initialStep: string): Promise<void> {
    this.currentWorkflow = workflowId
    this.currentStep = initialStep
    await this.save()
  }

  public async updateWorkflowStep(stepId: string): Promise<void> {
    this.currentStep = stepId
    await this.save()
  }

  public async endWorkflow(): Promise<void> {
    this.currentWorkflow = null
    this.currentStep = null
    this.clearCurrentContext()
    await this.save()
  }

  // Méthodes utilitaires
  public async recordInteraction(): Promise<void> {
    this.lastInteractionAt = DateTime.now()
    this.messageCount++
    await this.save()
  }

  public isInWorkflow(): boolean {
    return this.currentWorkflow !== null
  }

  // Scopes pour requêtes fréquentes
  public static active() {
    return this.query().where('isActive', true)
  }

  public static inWorkflow() {
    return this.query().whereNotNull('currentWorkflow')
  }

  public static recent() {
    return this.query().where('lastInteractionAt', '>', DateTime.now().minus({ hours: 24 }).toSQL())
  }

  public static async findActiveSession(channel: string, channelUserId: string) {
    return await this.query()
      .where('channel', channel)
      .where('channelUserId', channelUserId)
      .where('isActive', true)
      .first()
  }

  public static byWorkflow(workflowId: string) {
    return this.query().where('currentWorkflow', workflowId)
  }
}
