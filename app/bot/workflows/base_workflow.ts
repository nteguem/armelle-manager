import type {
  WorkflowDefinition,
  WorkflowStep,
  SubFlow,
  BotSessionExtended,
  WorkflowAction,
  ProgressInfo,
  ActionResult,
} from '#bot/types/bot_types'
import I18nManager from '#bot/core/i18n_manager'
import MessageBuilder from '#bot/core/message_builder'
import logger from '@adonisjs/core/services/logger'

export abstract class BaseWorkflow implements WorkflowDefinition {
  abstract id: string
  abstract initialStep: string
  abstract steps: Record<string, WorkflowStep>
  abstract subflows: Record<string, SubFlow>
  abstract menuTitleKey: string
  abstract menuOrder: number

  protected actions: Record<string, WorkflowAction> = {}
  protected i18n: I18nManager
  protected messageBuilder: MessageBuilder

  constructor() {
    this.i18n = I18nManager.getInstance()
    this.messageBuilder = new MessageBuilder()
    this.setupActions()
  }

  protected abstract setupActions(): void

  getStep(stepId: string): WorkflowStep {
    const step = this.steps[stepId]
    if (!step) {
      logger.error({ workflowId: this.id, stepId }, 'Step not found')
      throw new Error(`Step ${stepId} not found in workflow ${this.id}`)
    }
    return step
  }

  getSubflow(subflowId: string): SubFlow {
    const subflow = this.subflows[subflowId]
    if (!subflow) {
      logger.error({ workflowId: this.id, subflowId }, 'Subflow not found')
      throw new Error(`Subflow ${subflowId} not found in workflow ${this.id}`)
    }
    return subflow
  }

  async executeAction(
    actionName: string,
    session: BotSessionExtended,
    input?: any
  ): Promise<ActionResult> {
    const action = this.actions[actionName]
    if (!action) {
      logger.error({ workflowId: this.id, actionName }, 'Action not found')
      throw new Error(`Action ${actionName} not found in workflow ${this.id}`)
    }

    logger.debug({ workflowId: this.id, actionName, userId: session.botUserId }, 'Executing action')
    return await action(session, input)
  }

  async buildStepMessage(step: WorkflowStep, session: BotSessionExtended): Promise<string> {
    const progress = this.calculateProgress(step, session)
    const params = { ...session.currentContext }

    // Si pas de progression, message simple
    if (step.progressMode === 'none' || !progress) {
      return this.messageBuilder.build({
        content: this.i18n.t(step.messageKey, params, session.botUser.language),
        subheader: step.subheaderKey
          ? this.i18n.t(step.subheaderKey, params, session.botUser.language)
          : undefined,
        footer: step.footerKey
          ? this.i18n.t(step.footerKey, params, session.botUser.language)
          : undefined,
        language: session.botUser.language,
        params,
      })
    }

    // Message avec progression
    return this.messageBuilder.buildWithProgress(
      step.messageKey,
      progress,
      step.footerKey || 'common.navigation.enter_text',
      session.botUser.language,
      params
    )
  }

  private calculateProgress(step: WorkflowStep, session: BotSessionExtended): ProgressInfo | null {
    if (step.progressMode === 'none') return null

    if (step.subflowId) {
      const subflow = this.getSubflow(step.subflowId)
      const subflowName = this.i18n.t(subflow.nameKey, {}, session.botUser.language)

      return {
        current: session.subflowPosition || 1,
        total: subflow.totalSteps,
        subflowName,
      }
    }

    // Progression globale (fallback)
    const totalSteps = Object.keys(this.steps).length
    const currentIndex = Object.keys(this.steps).indexOf(step.id) + 1

    return {
      current: currentIndex,
      total: totalSteps,
    }
  }

  isAvailableFor(session: BotSessionExtended): boolean {
    if (this.requiresVerification && !session.botUser.isVerified) return false
    if (this.requiresTaxpayer && !session.botUser.taxpayerId) return false
    return true
  }

  get requiresVerification(): boolean {
    return true
  }

  get requiresTaxpayer(): boolean {
    return false
  }
}
