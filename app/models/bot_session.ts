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
    prepare: (value: Record<string, any>) => JSON.stringify(value || {}),
    consume: (value: string | null) => {
      if (!value || value === 'null') return {}
      try {
        return JSON.parse(value)
      } catch {
        return {}
      }
    },
  })
  declare currentContext: Record<string, any>

  @column({
    prepare: (value: Record<string, any>) => JSON.stringify(value || {}),
    consume: (value: string | null) => {
      if (!value || value === 'null') return {}
      try {
        return JSON.parse(value)
      } catch {
        return {}
      }
    },
  })
  declare persistentContext: Record<string, any>

  @column({
    prepare: (value: NavigationFrame[]) => JSON.stringify(value || []),
    consume: (value: string | null) => {
      if (!value || value === 'null') return []
      try {
        return JSON.parse(value)
      } catch {
        return []
      }
    },
  })
  declare navigationStack: NavigationFrame[]

  @column({
    prepare: (value: WorkflowHistory) =>
      JSON.stringify(value || { completed: [], abandoned: [], currentPath: [], totalWorkflows: 0 }),
    consume: (value: string | null) => {
      if (!value || value === 'null')
        return { completed: [], abandoned: [], currentPath: [], totalWorkflows: 0 }
      try {
        return JSON.parse(value)
      } catch {
        return { completed: [], abandoned: [], currentPath: [], totalWorkflows: 0 }
      }
    },
  })
  declare workflowHistory: WorkflowHistory

  @column({
    prepare: (value: ActiveWorkflow[]) => JSON.stringify(value || []),
    consume: (value: string | null) => {
      if (!value || value === 'null') return []
      try {
        return JSON.parse(value)
      } catch {
        return []
      }
    },
  })
  declare activeWorkflows: ActiveWorkflow[]

  @column()
  declare isActive: boolean

  @column.dateTime()
  declare lastActivityAt: DateTime

  @column.dateTime()
  declare lastInteractionAt: DateTime | null

  @column.dateTime()
  declare expiresAt: DateTime | null

  @column()
  declare messageCount: number

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
  public isExpired(): boolean {
    if (!this.expiresAt) return false
    return DateTime.now() > this.expiresAt
  }

  public async updateActivity(): Promise<void> {
    this.lastActivityAt = DateTime.now()
    this.lastInteractionAt = DateTime.now()
    this.messageCount += 1
    await this.save()
  }

  public async startWorkflow(workflowId: string, stepId: string): Promise<void> {
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

  public async goBack(): Promise<boolean> {
    if (this.navigationStack.length === 0) return false

    const previousFrame = this.navigationStack[this.navigationStack.length - 1]
    if (!previousFrame.canReturn) return false

    this.navigationStack = this.navigationStack.slice(0, -1)

    this.currentWorkflow = previousFrame.workflowId
    this.currentStep = previousFrame.stepId
    this.currentContext = previousFrame.context

    await this.save()
    return true
  }

  public async completeWorkflow(): Promise<void> {
    if (!this.currentWorkflow) return

    this.workflowHistory = {
      ...this.workflowHistory,
      completed: [...this.workflowHistory.completed, this.currentWorkflow],
      currentPath: [...this.workflowHistory.currentPath, this.currentWorkflow],
      totalWorkflows: this.workflowHistory.totalWorkflows + 1,
    }

    this.activeWorkflows = this.activeWorkflows.filter((w) => w.id !== this.currentWorkflow)

    this.currentWorkflow = null
    this.currentStep = null
    this.currentContext = {}
    this.navigationStack = []

    await this.save()
  }

  public async abandonWorkflow(): Promise<void> {
    if (!this.currentWorkflow) return

    this.workflowHistory = {
      ...this.workflowHistory,
      abandoned: [...this.workflowHistory.abandoned, this.currentWorkflow],
    }

    this.activeWorkflows = this.activeWorkflows.filter((w) => w.id !== this.currentWorkflow)

    this.currentWorkflow = null
    this.currentStep = null
    this.currentContext = {}
    this.navigationStack = []

    await this.save()
  }

  public async setExpiration(hours: number): Promise<void> {
    this.expiresAt = DateTime.now().plus({ hours })
    await this.save()
  }

  public getFullContext(): SessionContext {
    return {
      current: this.currentContext,
      persistent: this.persistentContext,
      navigationStack: this.navigationStack,
      workflowHistory: this.workflowHistory,
      activeWorkflows: this.activeWorkflows,
    }
  }

  public async setPersistentData(key: string, value: any): Promise<void> {
    this.persistentContext = {
      ...this.persistentContext,
      [key]: value,
    }
    await this.save()
  }

  private addToNavigationStack(frame: NavigationFrame): void {
    this.navigationStack = [...this.navigationStack, frame]

    const maxStackSize = 50
    if (this.navigationStack.length > maxStackSize) {
      this.navigationStack = this.navigationStack.slice(-maxStackSize)
    }
  }

  private addActiveWorkflow(workflow: ActiveWorkflow): void {
    this.activeWorkflows = [...this.activeWorkflows.filter((w) => w.id !== workflow.id), workflow]
  }

  public static active() {
    return this.query().where('isActive', true)
  }

  public static notExpired() {
    return this.query().where((query) => {
      query.whereNull('expiresAt').orWhere('expiresAt', '>', DateTime.now().toSQL())
    })
  }

  public static byChannel(channel: MessageChannel) {
    return this.query().where('channel', channel)
  }

  public static findActiveSession(channel: MessageChannel, channelUserId: string) {
    return this.query()
      .where('channel', channel)
      .where('channelUserId', channelUserId)
      .where('isActive', true)
      .first()
  }

  public static expired() {
    return this.query().whereNotNull('expiresAt').where('expiresAt', '<', DateTime.now().toSQL())
  }
}
