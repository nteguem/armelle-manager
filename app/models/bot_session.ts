import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import BotUser from './bot_user.js'
import BotMessage from './bot_message.js'
import type {
  MessageChannel,
  NavigationFrame,
  WorkflowHistory,
  ActiveWorkflow,
  SessionContext,
} from '#bot/types/bot_types'

export default class BotSession extends BaseModel {
  static table = 'bot_sessions'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare botUserId: string

  @column()
  declare channel: MessageChannel

  @column()
  declare channelUserId: string

  @column()
  declare currentWorkflow: string | null

  @column()
  declare currentStep: string | null

  @column({
    prepare: (value: Record<string, any>) => JSON.stringify(value),
    consume: (value: string) => JSON.parse(value),
  })
  declare currentContext: Record<string, any>

  @column({
    prepare: (value: Record<string, any>) => JSON.stringify(value),
    consume: (value: string) => JSON.parse(value),
  })
  declare persistentContext: Record<string, any>

  @column({
    prepare: (value: NavigationFrame[]) => JSON.stringify(value),
    consume: (value: string) => JSON.parse(value),
  })
  declare navigationStack: NavigationFrame[]

  @column({
    prepare: (value: WorkflowHistory) => JSON.stringify(value),
    consume: (value: string) => JSON.parse(value),
  })
  declare workflowHistory: WorkflowHistory

  @column({
    prepare: (value: ActiveWorkflow[]) => JSON.stringify(value),
    consume: (value: string) => JSON.parse(value),
  })
  declare activeWorkflows: ActiveWorkflow[]

  @column()
  declare isActive: boolean

  @column.dateTime()
  declare lastActivityAt: DateTime

  @column.dateTime()
  declare expiresAt: DateTime | null

  @column()
  declare messageCount: number

  @column()
  declare userAgent: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /**
   * Relations
   */
  @belongsTo(() => BotUser)
  declare botUser: BelongsTo<typeof BotUser>

  @hasMany(() => BotMessage)
  declare messages: HasMany<typeof BotMessage>

  /**
   * Méthodes métier
   */

  /**
   * Vérifie si la session est expirée
   */
  public isExpired(): boolean {
    if (!this.expiresAt) return false
    return DateTime.now() > this.expiresAt
  }

  /**
   * Met à jour l'activité de la session
   */
  public async updateActivity(): Promise<void> {
    this.lastActivityAt = DateTime.now()
    this.messageCount += 1
    await this.save()
  }

  /**
   * Démarre un nouveau workflow
   */
  public async startWorkflow(workflowId: string, stepId: string): Promise<void> {
    // Sauvegarder l'état actuel dans la pile navigation
    if (this.currentWorkflow && this.currentStep) {
      this.addToNavigationStack({
        workflowId: this.currentWorkflow,
        stepId: this.currentStep,
        timestamp: DateTime.now().toMillis(),
        context: { ...this.currentContext },
        canReturn: true,
      })
    }

    this.currentWorkflow = workflowId
    this.currentStep = stepId
    this.currentContext = {}

    // Ajouter aux workflows actifs
    this.addActiveWorkflow({
      id: workflowId,
      status: 'active',
      currentStep: stepId,
      priority: 1,
      startedAt: new Date(),
      lastActivityAt: new Date(),
    })

    await this.save()
  }

  /**
   * Change d'étape dans le workflow actuel
   */
  public async moveToStep(stepId: string, context?: Record<string, any>): Promise<void> {
    if (this.currentWorkflow && this.currentStep) {
      this.addToNavigationStack({
        workflowId: this.currentWorkflow,
        stepId: this.currentStep,
        timestamp: DateTime.now().toMillis(),
        context: { ...this.currentContext },
        canReturn: true,
      })
    }

    this.currentStep = stepId
    if (context) {
      this.currentContext = { ...this.currentContext, ...context }
    }
    await this.save()
  }

  /**
   * Retour à l'étape précédente (navigation arrière)
   */
  public async goBack(): Promise<boolean> {
    if (this.navigationStack.length === 0) return false

    const previousFrame = this.navigationStack[this.navigationStack.length - 1]
    if (!previousFrame.canReturn) return false

    // Retirer le dernier élément de la pile
    this.navigationStack = this.navigationStack.slice(0, -1)

    // Restaurer l'état précédent
    this.currentWorkflow = previousFrame.workflowId
    this.currentStep = previousFrame.stepId
    this.currentContext = previousFrame.context

    await this.save()
    return true
  }

  /**
   * Termine le workflow actuel
   */
  public async completeWorkflow(): Promise<void> {
    if (!this.currentWorkflow) return

    // Ajouter aux workflows complétés
    this.workflowHistory = {
      ...this.workflowHistory,
      completed: [...this.workflowHistory.completed, this.currentWorkflow],
      currentPath: [...this.workflowHistory.currentPath, this.currentWorkflow],
      totalWorkflows: this.workflowHistory.totalWorkflows + 1,
    }

    // Supprimer des workflows actifs
    this.activeWorkflows = this.activeWorkflows.filter((w) => w.id !== this.currentWorkflow)

    // Reset workflow actuel
    this.currentWorkflow = null
    this.currentStep = null
    this.currentContext = {}
    this.navigationStack = []

    await this.save()
  }

  /**
   * Abandonne le workflow actuel
   */
  public async abandonWorkflow(): Promise<void> {
    if (!this.currentWorkflow) return

    // Ajouter aux workflows abandonnés
    this.workflowHistory = {
      ...this.workflowHistory,
      abandoned: [...this.workflowHistory.abandoned, this.currentWorkflow],
    }

    // Supprimer des workflows actifs
    this.activeWorkflows = this.activeWorkflows.filter((w) => w.id !== this.currentWorkflow)

    // Reset workflow actuel
    this.currentWorkflow = null
    this.currentStep = null
    this.currentContext = {}
    this.navigationStack = []

    await this.save()
  }

  /**
   * Définit l'expiration de la session
   */
  public async setExpiration(hours: number): Promise<void> {
    this.expiresAt = DateTime.now().plus({ hours })
    await this.save()
  }

  /**
   * Récupère le contexte complet de la session
   */
  public getFullContext(): SessionContext {
    return {
      current: this.currentContext,
      persistent: this.persistentContext,
      navigationStack: this.navigationStack,
      workflowHistory: this.workflowHistory,
      activeWorkflows: this.activeWorkflows,
    }
  }

  /**
   * Met à jour une valeur dans le contexte persistant
   */
  public async setPersistentData(key: string, value: any): Promise<void> {
    this.persistentContext = {
      ...this.persistentContext,
      [key]: value,
    }
    await this.save()
  }

  /**
   * Méthodes privées
   */
  private addToNavigationStack(frame: NavigationFrame): void {
    this.navigationStack = [...this.navigationStack, frame]

    // Limiter la taille de la pile (configuration)
    const maxStackSize = 50 // TODO: récupérer depuis config
    if (this.navigationStack.length > maxStackSize) {
      this.navigationStack = this.navigationStack.slice(-maxStackSize)
    }
  }

  private addActiveWorkflow(workflow: ActiveWorkflow): void {
    this.activeWorkflows = [...this.activeWorkflows.filter((w) => w.id !== workflow.id), workflow]
  }

  /**
   * Scopes de requête
   */

  /**
   * Sessions actives seulement
   */
  public static active() {
    return this.query().where('isActive', true)
  }

  /**
   * Sessions non expirées
   */
  public static notExpired() {
    return this.query().where((query) => {
      query.whereNull('expiresAt').orWhere('expiresAt', '>', DateTime.now().toSQL())
    })
  }

  /**
   * Sessions par canal
   */
  public static byChannel(channel: MessageChannel) {
    return this.query().where('channel', channel)
  }

  /**
   * Trouve une session active par canal et utilisateur
   */
  public static findActiveSession(channel: MessageChannel, channelUserId: string) {
    return this.query()
      .where('channel', channel)
      .where('channelUserId', channelUserId)
      .where('isActive', true)
      .first()
  }

  /**
   * Sessions expirées pour nettoyage
   */
  public static expired() {
    return this.query().whereNotNull('expiresAt').where('expiresAt', '<', DateTime.now().toSQL())
  }
}
