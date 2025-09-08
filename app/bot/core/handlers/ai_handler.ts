import { BaseHandler } from './base_handler.js'
import type { HandlerResult } from '#bot/contracts/handler.contract'
import type { StateContext } from '#bot/types/state.types'
import { BotState } from '#bot/types/state.types'
import AIEngine from '#bot/core/ai/engine/ai_engine'
import SessionManager from '#bot/core/managers/session_manager'

export class AIHandler extends BaseHandler {
  readonly name = 'ai_handler'
  readonly supportedStates = [BotState.IDLE, BotState.AI_PROCESSING, BotState.AI_WAITING_CONFIRM]

  private aiEngine: AIEngine
  private sessionManager: SessionManager

  constructor() {
    super()
    this.aiEngine = AIEngine.getInstance()
    this.sessionManager = SessionManager.getInstance()
  }

  async handle(context: StateContext, input: string): Promise<HandlerResult> {
    // Gestion de la confirmation
    if (context.currentState === BotState.AI_WAITING_CONFIRM) {
      return this.handleConfirmation(context, input)
    }

    try {
      // Obtenir la réponse de l'IA
      const aiResponse = await this.aiEngine.processMessage(input, context.session)

      // Vérifier si un workflow a été détecté
      const updatedSession = await this.sessionManager.getOrCreateSession(
        context.session.channel,
        context.session.channelUserId
      )

      if (updatedSession.workflowData?.pendingWorkflow) {
        // Workflow détecté, passer en mode confirmation
        return {
          success: true,
          message: aiResponse,
          nextState: BotState.AI_WAITING_CONFIRM,
          stateData: {
            pendingWorkflow: updatedSession.workflowData.pendingWorkflow,
          },
        }
      }

      // Réponse normale
      return this.successResult(aiResponse, BotState.IDLE)
    } catch (error: any) {
      this.log('error', 'AI processing failed', context, { error: error.message })

      const fallbackMessage = this.buildMessage({ key: 'errors.ai_unavailable' }, context, {
        useDefaultFooter: true,
      })

      return this.successResult(fallbackMessage, BotState.IDLE)
    }
  }

  private async handleConfirmation(context: StateContext, input: string): Promise<HandlerResult> {
    const normalized = input.toLowerCase().trim()
    const pendingWorkflow = context.stateData?.pendingWorkflow

    if (!pendingWorkflow) {
      return this.handle(context, input)
    }

    // Mots de confirmation selon la langue
    const language = context.session.language
    const confirmWords =
      language === 'fr'
        ? ['oui', 'yes', 'ok', "d'accord", 'daccord', 'commence', 'commencer']
        : ['yes', 'ok', 'okay', 'sure', 'start', 'begin', 'confirm']

    const denyWords =
      language === 'fr'
        ? ['non', 'no', 'pas', 'annule', 'annuler']
        : ['no', 'nope', 'cancel', 'stop', 'abort']

    // Nettoyer le workflow en attente
    await this.sessionManager.updateSessionContext(context.session, {
      workflowData: {
        ...context.session.workflowData,
        pendingWorkflow: undefined,
      },
    })

    if (confirmWords.some((word) => normalized.includes(word))) {
      // Lancer le workflow
      return {
        success: true,
        nextState: BotState.USER_WORKFLOW,
        stateData: { workflowId: pendingWorkflow },
      }
    }

    if (denyWords.some((word) => normalized.includes(word))) {
      // Annuler et continuer la conversation
      const message =
        language === 'fr'
          ? "D'accord, continuons notre conversation."
          : "Alright, let's continue our conversation."

      const formatted = this.buildMessage(message, context, { useDefaultFooter: true })

      // Nettoyer le cache de l'IA pour cette session
      this.aiEngine.clearSessionCache(context.session)

      return this.successResult(formatted, BotState.IDLE)
    }

    // Ambigu, traiter comme une nouvelle conversation
    return this.handle(context, input)
  }
}
