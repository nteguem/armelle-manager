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
    // Gestion de la confirmation de workflow
    if (context.currentState === BotState.AI_WAITING_CONFIRM) {
      return this.handleWorkflowConfirmation(context, input)
    }

    try {
      // Traitement normal avec l'IA
      const aiResponse = await this.aiEngine.processMessage(input, context.session)

      // Vérifier si un workflow a été détecté et sauvegardé
      const updatedSession = await this.sessionManager.getOrCreateSession(
        context.session.channel,
        context.session.channelUserId
      )

      if (updatedSession.workflowData?.pendingWorkflow) {
        // Workflow détecté → transition vers confirmation
        return {
          success: true,
          message: aiResponse,
          nextState: BotState.AI_WAITING_CONFIRM,
          stateData: {
            pendingWorkflow: updatedSession.workflowData.pendingWorkflow,
          },
        }
      }

      // Réponse conversationnelle normale
      return this.successResult(aiResponse, BotState.IDLE)
    } catch (error: any) {
      this.log('error', 'AI processing failed', context, { error: error.message })

      const fallbackMessage = this.buildMessage({ key: 'errors.ai_unavailable' }, context, {
        useDefaultFooter: true,
      })

      return this.successResult(fallbackMessage, BotState.IDLE)
    }
  }

  /**
   * Gérer la confirmation de workflow
   */
  private async handleWorkflowConfirmation(
    context: StateContext,
    input: string
  ): Promise<HandlerResult> {
    const normalized = input.toLowerCase().trim()
    const language = context.session.language
    const pendingWorkflow = context.stateData?.pendingWorkflow

    if (!pendingWorkflow) {
      // Pas de workflow en attente, traiter comme message normal
      return this.handle({ ...context, currentState: BotState.IDLE }, input)
    }

    // Mots de confirmation selon la langue
    const confirmWords =
      language === 'fr'
        ? ['oui', 'yes', 'ok', "d'accord", 'daccord', 'commence', 'commencer']
        : ['yes', 'ok', 'okay', 'sure', 'start', 'begin', 'confirm']

    const denyWords =
      language === 'fr'
        ? ['non', 'no', 'pas', 'annule', 'annuler']
        : ['no', 'nope', 'cancel', 'stop', 'abort']

    // Nettoyer le workflow en attente après traitement
    await this.cleanupPendingWorkflow(context.session)

    if (confirmWords.some((word) => normalized.includes(word))) {
      // Confirmation → lancer le workflow
      this.log('info', 'Workflow confirmed by user', context, { workflowId: pendingWorkflow })

      return {
        success: true,
        nextState: BotState.USER_WORKFLOW,
        stateData: { workflowId: pendingWorkflow },
      }
    }

    if (denyWords.some((word) => normalized.includes(word))) {
      // Refus → retour à la conversation
      const message =
        language === 'fr'
          ? "D'accord, continuons notre conversation. Comment puis-je vous aider ?"
          : "Alright, let's continue our conversation. How can I help you?"

      const formatted = this.buildMessage(message, context, { useDefaultFooter: true })

      this.log('info', 'Workflow denied by user', context, { workflowId: pendingWorkflow })

      return this.successResult(formatted, BotState.IDLE)
    }

    // Réponse ambiguë → traiter comme nouveau message
    this.log('warn', 'Ambiguous response to workflow confirmation', context, {
      input: normalized,
      pendingWorkflow,
    })

    return this.handle({ ...context, currentState: BotState.IDLE }, input)
  }

  /**
   * Nettoyer le workflow en attente
   */
  private async cleanupPendingWorkflow(session: any): Promise<void> {
    try {
      await this.sessionManager.updateSessionContext(session, {
        workflowData: {
          ...session.workflowData,
          pendingWorkflow: undefined,
        },
      })
    } catch (error) {
      this.log('warn', 'Failed to cleanup pending workflow', error)
    }
  }
}
