import { AnthropicProvider } from '../providers/anthropic_provider.js'
import ContextBuilder from '../processors/context_builder.js'
import IntentDetector from '../processors/intent_detector.js'
import I18nManager from '#bot/core/managers/i18n_manager'
import MessageBuilder from '#bot/core/managers/message_builder'
import SessionManager from '#bot/core/managers/session_manager'
import type { AIProvider, AIRequest, AIResponse } from '#bot/types/ai_types'
import type { SessionContext } from '#bot/types/bot_types'

export default class AIEngine {
  private static instance: AIEngine
  private provider: AIProvider | null = null
  private contextBuilder: ContextBuilder
  private intentDetector: IntentDetector
  private i18n: I18nManager
  private messageBuilder: MessageBuilder
  private initialized = false
  private lastFormattedMessage: string | null = null // Pour éviter le double formatage

  private constructor() {
    this.contextBuilder = new ContextBuilder()
    this.intentDetector = new IntentDetector()
    this.i18n = I18nManager.getInstance()
    this.messageBuilder = new MessageBuilder()
  }

  public static getInstance(): AIEngine {
    if (!AIEngine.instance) {
      AIEngine.instance = new AIEngine()
    }
    return AIEngine.instance
  }

  async initialize(providerName: string = 'anthropic'): Promise<void> {
    if (this.initialized) return

    if (providerName === 'anthropic') {
      this.provider = new AnthropicProvider()
      await this.provider.initialize({
        name: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY,
      })
    }

    this.initialized = true
    console.log(`✅ AI Engine initialized with ${providerName}`)
  }

  /**
   * Traite un message et retourne une réponse formatée UNIQUEMENT si pas déjà fait
   */
  async processMessage(message: string, sessionContext: SessionContext): Promise<string> {
    if (!this.provider || !this.provider.isAvailable()) {
      const formatted = this.messageBuilder.build({
        content: this.i18n.t('errors.ai_unavailable', {}, sessionContext.language),
        footer: this.i18n.t('common.footer_options', {}, sessionContext.language),
        language: sessionContext.language,
      })
      this.lastFormattedMessage = formatted
      return formatted
    }

    try {
      const context = await this.contextBuilder.build(sessionContext)

      const request: AIRequest = {
        message,
        context,
        options: {
          detectIntents: true,
          style: 'friendly',
        },
      }

      const response = await this.provider.generateResponse(request)

      // Détection d'intention avec haute confiance
      if (response.intents && response.intents.length > 0) {
        const topIntent = response.intents[0]
        if (topIntent.confidence > 0.8) {
          const workflowName =
            context.availableWorkflows.find((w) => w.id === topIntent.workflowId)?.name ||
            topIntent.workflowId

          const sessionManager = SessionManager.getInstance()
          await sessionManager.updateSessionContext(sessionContext, {
            workflowData: {
              ...sessionContext.workflowData,
              pendingWorkflow: topIntent.workflowId,
            },
          })

          const suggestion = this.i18n.t(
            'ai.workflow_suggestion',
            { workflowName },
            sessionContext.language
          )

          // Formater une seule fois
          const formatted = this.messageBuilder.build({
            content: `${response.message}\n\n${suggestion}`,
            footer: this.i18n.t('common.footer_options', {}, sessionContext.language),
            language: sessionContext.language,
          })
          this.lastFormattedMessage = formatted
          return formatted
        }
      }

      // Vérifier si le message contient déjà le header (double appel)
      if (response.message.includes('Mon assistant Virtuel IGS')) {
        // Message déjà formaté, le retourner tel quel
        return response.message
      }

      // Formater le message une seule fois
      const formatted = this.messageBuilder.build({
        content: response.message,
        footer: this.i18n.t('common.footer_options', {}, sessionContext.language),
        language: sessionContext.language,
      })
      this.lastFormattedMessage = formatted
      return formatted
    } catch (error: any) {
      console.error('AI Engine error:', error)

      const formatted = this.messageBuilder.build({
        content: this.i18n.t('errors.ai_error', {}, sessionContext.language),
        footer: this.i18n.t('common.footer_options', {}, sessionContext.language),
        language: sessionContext.language,
      })
      this.lastFormattedMessage = formatted
      return formatted
    }
  }

  async detectIntent(message: string, sessionContext: SessionContext): Promise<any> {
    const context = await this.contextBuilder.build(sessionContext)
    return this.intentDetector.detect(message, context.availableWorkflows)
  }

  isAvailable(): boolean {
    return this.initialized && this.provider !== null && this.provider.isAvailable()
  }

  getStats() {
    if (!this.provider) {
      return {
        available: false,
        provider: 'none',
      }
    }

    return {
      available: this.isAvailable(),
      provider: this.provider.name,
      usage: this.provider.getUsageStats(),
    }
  }
}
