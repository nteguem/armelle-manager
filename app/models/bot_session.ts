import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import BotUser from './bot_user.js'
import BotMessage from './bot_message.js'

interface NavigationState {
  workflow: string | null
  step: string | null
  subflow: string | null
  subflowPosition: number
  context: Record<string, any>
  timestamp: string
}

interface WorkflowHistoryEntry {
  startedAt: string
  completedAt?: string
  steps: string[]
  outcome?: string
}

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
  declare persistentContext: Record<string, any>

  @column()
  declare navigationStack: NavigationState[]

  @column()
  declare workflowHistory: Record<string, WorkflowHistoryEntry>

  @column()
  declare activeWorkflows: string[]

  @column()
  declare isActive: boolean

  @column.dateTime()
  declare lastInteractionAt: DateTime | null

  @column()
  declare messageCount: number

  @column()
  declare workflowCount: number

  @column()
  declare tempData: Record<string, any>

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

  public updatePersistentContext(data: Record<string, any>): void {
    this.persistentContext = {
      ...this.persistentContext,
      ...data,
    }
  }

  public clearCurrentContext(): void {
    this.currentContext = {}
  }

  // Méthodes de navigation
  public pushNavigationState(state: Omit<NavigationState, 'timestamp'>): void {
    this.navigationStack.push({
      ...state,
      timestamp: DateTime.now().toISO(),
    })
  }

  public popNavigationState(): NavigationState | null {
    return this.navigationStack.pop() || null
  }

  public canGoBack(): boolean {
    return this.navigationStack.length > 0
  }

  // Méthodes de workflow
  public async startWorkflow(workflowId: string, initialStep: string): Promise<void> {
    this.currentWorkflow = workflowId
    this.currentStep = initialStep
    this.workflowCount++

    // Ajouter à l'historique
    this.workflowHistory[workflowId] = {
      startedAt: DateTime.now().toISO(),
      steps: [initialStep],
    }

    // Ajouter aux workflows actifs
    if (!this.activeWorkflows.includes(workflowId)) {
      this.activeWorkflows.push(workflowId)
    }

    await this.save()
  }

  public async updateWorkflowStep(stepId: string): Promise<void> {
    this.currentStep = stepId

    if (this.currentWorkflow && this.workflowHistory[this.currentWorkflow]) {
      this.workflowHistory[this.currentWorkflow].steps.push(stepId)
    }

    await this.save()
  }

  public async endWorkflow(outcome?: string): Promise<void> {
    if (this.currentWorkflow) {
      // Mettre à jour l'historique
      if (this.workflowHistory[this.currentWorkflow]) {
        this.workflowHistory[this.currentWorkflow].completedAt = DateTime.now().toISO()
        this.workflowHistory[this.currentWorkflow].outcome = outcome
      }

      // Retirer des workflows actifs
      this.activeWorkflows = this.activeWorkflows.filter((w) => w !== this.currentWorkflow)

      // Nettoyer l'état actuel
      this.currentWorkflow = null
      this.currentStep = null
      this.clearCurrentContext()
    }

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

  public getWorkflowDuration(): number | null {
    if (!this.currentWorkflow || !this.workflowHistory[this.currentWorkflow]) {
      return null
    }

    const history = this.workflowHistory[this.currentWorkflow]
    const startedAt = DateTime.fromISO(history.startedAt)
    return DateTime.now().diff(startedAt, 'minutes').minutes
  }

  // Données temporaires
  public setTempData(key: string, value: any): void {
    this.tempData[key] = value
  }

  public getTempData(key: string): any {
    return this.tempData[key]
  }

  public clearTempData(): void {
    this.tempData = {}
  }

  // ✅ Scopes convertis en méthodes statiques
  public static active() {
    return this.query().where('isActive', true)
  }

  public static inWorkflow() {
    return this.query().whereNotNull('currentWorkflow')
  }

  public static recent() {
    return this.query().where('lastInteractionAt', '>', DateTime.now().minus({ hours: 24 }).toSQL())
  }

  // ✅ Méthodes utilitaires statiques
  public static async findActiveSession(channel: string, channelUserId: string) {
    return await this.query()
      .where('channel', channel)
      .where('channelUserId', channelUserId)
      .where('isActive', true)
      .first()
  }
}
