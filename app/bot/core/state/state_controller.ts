// app/bot/core/state/state_controller.ts

import type { SessionContext, SupportedLanguage } from '#bot/types/bot_types'
import type { StateContext, StateTransition } from '#bot/types/state.types'
import {
  BotState,
  getInitialState,
  isValidTransition,
  STATE_PRIORITY,
} from '#bot/types/state.types'
import logger from '@adonisjs/core/services/logger'

export class StateController {
  private static instance: StateController
  private stateContexts: Map<string, StateContext> = new Map()
  private transitionHistory: Map<string, StateTransition[]> = new Map()

  private constructor() {}

  public static getInstance(): StateController {
    if (!StateController.instance) {
      StateController.instance = new StateController()
    }
    return StateController.instance
  }

  public getStateContext(session: SessionContext): StateContext {
    const key = this.getSessionKey(session)

    let context = this.stateContexts.get(key)
    if (!context) {
      const initialState = getInitialState(session)
      context = {
        currentState: initialState,
        session,
        stateEnteredAt: new Date(),
        stateData: {},
      }
      this.stateContexts.set(key, context)

      logger.info(
        {
          sessionId: key,
          state: initialState,
          language: session.language,
        },
        'State context created'
      )
    }

    return context
  }

  /**
   * AJOUT: Méthode pour vérifier si une transition est possible
   */
  public async canTransition(context: StateContext, toState: BotState): Promise<boolean> {
    return isValidTransition(context.currentState, toState)
  }

  public async transition(
    context: StateContext,
    toState: BotState,
    trigger: string,
    data?: any
  ): Promise<StateContext> {
    const fromState = context.currentState

    // Vérifier si la transition est valide
    if (!isValidTransition(fromState, toState)) {
      const error = this.getTransitionError(fromState, toState, context.session.language)
      logger.warn(
        {
          from: fromState,
          to: toState,
          trigger,
          language: context.session.language,
        },
        error
      )
      throw new Error(error)
    }

    // Créer l'objet transition
    const transition: StateTransition = {
      from: fromState,
      to: toState,
      trigger,
      timestamp: new Date(),
      data,
    }

    // Mettre à jour le contexte
    context.previousState = context.currentState
    context.currentState = toState
    context.lastTransition = transition.timestamp
    context.stateEnteredAt = new Date()

    // Conserver les données spécifiques selon l'état
    context.stateData = this.preserveStateData(context, toState, data)

    // Sauvegarder dans l'historique
    this.saveTransition(context.session, transition)

    logger.info(
      {
        sessionId: this.getSessionKey(context.session),
        from: fromState,
        to: toState,
        trigger,
        language: context.session.language,
      },
      'State transition'
    )

    return context
  }

  public determineNextState(
    context: StateContext,
    input: string,
    additionalData?: any
  ): { state: BotState; trigger: string; data?: any } {
    const currentState = context.currentState
    const normalizedInput = input.toLowerCase().trim()

    switch (currentState) {
      case BotState.UNVERIFIED:
        return {
          state: BotState.SYSTEM_WORKFLOW,
          trigger: 'start_onboarding',
          data: { workflowId: 'onboarding' },
        }

      case BotState.IDLE:
        if (this.isCommand(normalizedInput, 'menu')) {
          return { state: BotState.MENU_DISPLAYED, trigger: 'menu_command' }
        }

        // Si on a détecté un workflow
        if (additionalData?.pendingWorkflow) {
          return {
            state: BotState.AI_WAITING_CONFIRM,
            trigger: 'workflow_detected',
            data: { pendingWorkflow: additionalData.pendingWorkflow },
          }
        }

        return { state: BotState.IDLE, trigger: 'user_message' }

      case BotState.AI_WAITING_CONFIRM:
        if (this.isConfirmation(normalizedInput, context.session.language)) {
          return {
            state: BotState.USER_WORKFLOW,
            trigger: 'workflow_confirmed',
            data: { workflowId: context.stateData?.pendingWorkflow },
          }
        }

        if (this.isDenial(normalizedInput, context.session.language)) {
          return { state: BotState.IDLE, trigger: 'workflow_denied' }
        }

        return { state: BotState.IDLE, trigger: 'continue_conversation' }

      case BotState.MENU_DISPLAYED:
        const selection = Number.parseInt(normalizedInput)
        if (!Number.isNaN(selection) && selection >= 0) {
          if (selection === 0) {
            return { state: BotState.IDLE, trigger: 'menu_cancelled' }
          }
          return {
            state: BotState.USER_WORKFLOW,
            trigger: 'menu_selection',
            data: { selection },
          }
        }

        if (this.isCommand(normalizedInput, 'armelle')) {
          return { state: BotState.IDLE, trigger: 'back_to_assistant' }
        }

        return { state: BotState.IDLE, trigger: 'invalid_menu_selection' }

      case BotState.SYSTEM_WORKFLOW:
      case BotState.USER_WORKFLOW:
        if (this.isCommand(normalizedInput, 'armelle') && currentState === BotState.USER_WORKFLOW) {
          return { state: BotState.IDLE, trigger: 'workflow_cancelled' }
        }

        return { state: currentState, trigger: 'workflow_input' }

      default:
        return { state: BotState.ERROR, trigger: 'unknown_state' }
    }
  }

  private isCommand(input: string, command: string): boolean {
    const commands: Record<string, string[]> = {
      menu: ['menu', 'options', 'aide', 'help'],
      armelle: ['armelle', 'retour', 'back', 'annuler', 'cancel'],
      fr: ['fr', 'français', 'french'],
      en: ['en', 'english', 'anglais'],
    }

    return commands[command]?.includes(input) || false
  }

  private isConfirmation(input: string, language: SupportedLanguage): boolean {
    const confirmWords: Record<SupportedLanguage, string[]> = {
      fr: ['oui', 'yes', 'ok', "d'accord", 'daccord', 'commence', 'commencer', 'confirme'],
      en: ['yes', 'ok', 'okay', 'sure', 'confirm', 'start', 'begin', 'agree'],
    }

    return confirmWords[language].some((word) => input.includes(word))
  }

  private isDenial(input: string, language: SupportedLanguage): boolean {
    const denyWords: Record<SupportedLanguage, string[]> = {
      fr: ['non', 'no', 'pas', 'annule', 'annuler', 'stop', 'refuse'],
      en: ['no', 'nope', 'cancel', 'stop', 'refuse', 'decline', 'abort'],
    }

    return denyWords[language].some((word) => input.includes(word))
  }

  private preserveStateData(context: StateContext, newState: BotState, newData?: any): any {
    const preserved: any = {}

    if (newState === BotState.USER_WORKFLOW || newState === BotState.SYSTEM_WORKFLOW) {
      preserved.workflowId = newData?.workflowId || context.stateData?.workflowId
      preserved.workflowStep = newData?.workflowStep
    }

    if (newState === BotState.AI_WAITING_CONFIRM) {
      preserved.pendingWorkflow = newData?.pendingWorkflow
    }

    if (newState === BotState.MENU_DISPLAYED) {
      preserved.menuOptions = newData?.menuOptions
    }

    if (newState === BotState.ERROR) {
      preserved.error = newData?.error
      preserved.previousData = context.stateData
    }

    preserved.lastUserInput = newData?.lastUserInput

    return preserved
  }

  private getTransitionError(from: BotState, to: BotState, language: SupportedLanguage): string {
    const messages: Record<SupportedLanguage, string> = {
      fr: `Transition invalide de ${from} vers ${to}`,
      en: `Invalid transition from ${from} to ${to}`,
    }
    return messages[language]
  }

  private saveTransition(session: SessionContext, transition: StateTransition): void {
    const key = this.getSessionKey(session)

    let history = this.transitionHistory.get(key)
    if (!history) {
      history = []
      this.transitionHistory.set(key, history)
    }

    history.push(transition)

    if (history.length > 50) {
      history.shift()
    }
  }

  public resetState(session: SessionContext): void {
    const key = this.getSessionKey(session)
    this.stateContexts.delete(key)
    this.transitionHistory.delete(key)

    logger.info(
      {
        sessionId: key,
        language: session.language,
      },
      'State reset'
    )
  }

  public cleanup(maxAge: number = 3600000): void {
    const now = Date.now()

    for (const [key, context] of this.stateContexts) {
      if (now - context.stateEnteredAt.getTime() > maxAge) {
        this.stateContexts.delete(key)
        this.transitionHistory.delete(key)

        logger.info({ sessionId: key }, 'State context cleaned')
      }
    }
  }

  private getSessionKey(session: SessionContext): string {
    return `${session.channel}:${session.channelUserId}`
  }

  public getStats(): any {
    const states: Record<BotState, number> = {} as any

    for (const context of this.stateContexts.values()) {
      states[context.currentState] = (states[context.currentState] || 0) + 1
    }

    return {
      totalSessions: this.stateContexts.size,
      stateDistribution: states,
      historySizes: Array.from(this.transitionHistory.values()).map((h) => h.length),
    }
  }
}
