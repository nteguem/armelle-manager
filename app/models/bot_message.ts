import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BotUser from './bot_user.js'
import BotSession from './bot_session.js'

export default class BotMessage extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare sessionId: string

  @column()
  declare botUserId: string

  @column()
  declare direction: 'in' | 'out'

  @column()
  declare messageType: string

  @column()
  declare content: string

  @column()
  declare structuredContent: Record<string, any>

  @column()
  declare language: 'fr' | 'en'

  @column()
  declare rawData: Record<string, any>

  @column()
  declare workflowId: string | null

  @column()
  declare stepId: string | null

  @column()
  declare contextSnapshot: Record<string, any>

  @column()
  declare isProcessed: boolean

  @column()
  declare processingDurationMs: number | null

  @column()
  declare processingError: string | null

  @column()
  declare systemCommand: string | null

  @column()
  declare commandAllowed: boolean | null

  @column()
  declare validationType: string | null

  @column()
  declare validationPassed: boolean | null

  @column()
  declare validationError: string | null | undefined

  @column()
  declare metadata: Record<string, any>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  // Relations
  @belongsTo(() => BotSession)
  declare session: BelongsTo<typeof BotSession>

  @belongsTo(() => BotUser)
  declare botUser: BelongsTo<typeof BotUser>

  // Méthodes statiques pour créer des messages
  public static async createIncoming(params: {
    session: BotSession
    content: string
    messageType?: string
    rawData?: Record<string, any>
  }): Promise<BotMessage> {
    const message = await BotMessage.create({
      sessionId: params.session.id,
      botUserId: params.session.botUserId,
      direction: 'in',
      messageType: params.messageType || 'text',
      content: params.content,
      language: params.session.botUser?.language || 'fr',
      rawData: params.rawData || {},
      workflowId: params.session.currentWorkflow,
      stepId: params.session.currentStep,
      contextSnapshot: {
        currentContext: params.session.currentContext,
        persistentContext: params.session.persistentContext,
        navigationStackSize: params.session.navigationStack.length,
      },
    })

    // Mettre à jour la session
    await params.session.recordInteraction()

    return message
  }

  public static async createOutgoing(params: {
    session: BotSession
    content: string
    messageType?: string
    structuredContent?: Record<string, any>
  }): Promise<BotMessage> {
    return await BotMessage.create({
      sessionId: params.session.id,
      botUserId: params.session.botUserId,
      direction: 'out',
      messageType: params.messageType || 'text',
      content: params.content,
      structuredContent: params.structuredContent || {},
      language: params.session.botUser?.language || 'fr',
      workflowId: params.session.currentWorkflow,
      stepId: params.session.currentStep,
      contextSnapshot: {
        currentContext: params.session.currentContext,
        persistentContext: params.session.persistentContext,
      },
      isProcessed: true,
    })
  }

  // Méthodes d'instance
  public async markAsProcessed(durationMs: number): Promise<void> {
    this.isProcessed = true
    this.processingDurationMs = durationMs
    await this.save()
  }

  public async markAsError(error: string, durationMs?: number): Promise<void> {
    this.isProcessed = true
    this.processingError = error
    if (durationMs) {
      this.processingDurationMs = durationMs
    }
    await this.save()
  }

  public async recordSystemCommand(command: string, allowed: boolean): Promise<void> {
    this.systemCommand = command
    this.commandAllowed = allowed
    await this.save()
  }

  public async recordValidation(type: string, passed: boolean, error?: string): Promise<void> {
    this.validationType = type
    this.validationPassed = passed
    this.validationError = error
    await this.save()
  }

  // Méthodes utilitaires
  public isIncoming(): boolean {
    return this.direction === 'in'
  }

  public isOutgoing(): boolean {
    return this.direction === 'out'
  }

  public isCommand(): boolean {
    return this.systemCommand !== null
  }

  public isInWorkflow(): boolean {
    return this.workflowId !== null
  }

  public getProcessingTime(): number | null {
    return this.processingDurationMs
  }

  // Formatage pour affichage
  public getFormattedContent(): string {
    if (this.messageType === 'menu' && this.structuredContent.options) {
      const options = this.structuredContent.options as Array<{ id: string; label: string }>
      return `${this.content}\n\n${options.map((o) => `${o.id}. ${o.label}`).join('\n')}`
    }
    return this.content
  }

  // ✅ Scopes convertis en méthodes statiques
  public static incoming() {
    return this.query().where('direction', 'in')
  }

  public static outgoing() {
    return this.query().where('direction', 'out')
  }

  public static processed() {
    return this.query().where('isProcessed', true)
  }

  public static unprocessed() {
    return this.query().where('isProcessed', false)
  }

  public static commands() {
    return this.query().whereNotNull('systemCommand')
  }

  public static inWorkflow() {
    return this.query().whereNotNull('workflowId')
  }

  public static recent() {
    return this.query().where('createdAt', '>', DateTime.now().minus({ hours: 24 }).toSQL())
  }

  public static withErrors() {
    return this.query().whereNotNull('processingError')
  }

  public static byWorkflow(workflowId: string) {
    return this.query().where('workflowId', workflowId)
  }

  public static byStep(workflowId: string, stepId: string) {
    return this.query().where('workflowId', workflowId).where('stepId', stepId)
  }
}
