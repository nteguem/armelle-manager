import { AnthropicProvider } from '../providers/anthropic_provider.js'
import ContextBuilder from '../processors/context_builder.js'
import I18nManager from '#bot/core/managers/i18n_manager'
import MessageBuilder from '#bot/core/managers/message_builder'
import SessionManager from '#bot/core/managers/session_manager'
import { WorkflowRegistry } from '#bot/core/workflow/registry/workflow_registry'
import BotMessage from '#models/bot/bot_message'
import BotSession from '#models/bot/bot_session'
import type { AIProvider, WorkflowInfo } from '#bot/types/ai_types'
import type { SessionContext, SupportedLanguage } from '#bot/types/bot_types'
import logger from '@adonisjs/core/services/logger'

export default class AIEngine {
  private static instance: AIEngine
  private provider: AIProvider | null = null
  private contextBuilder: ContextBuilder
  private i18n: I18nManager
  private messageBuilder: MessageBuilder
  private workflowRegistry: WorkflowRegistry
  private sessionManager: SessionManager
  private initialized = false
  private conversationCache: Map<string, string[]> = new Map()

  private constructor() {
    this.contextBuilder = new ContextBuilder()
    this.i18n = I18nManager.getInstance()
    this.messageBuilder = new MessageBuilder()
    this.workflowRegistry = WorkflowRegistry.getInstance()
    this.sessionManager = SessionManager.getInstance()
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
    logger.info(`AI Engine initialized with ${providerName}`)
  }

  async processMessage(message: string, sessionContext: SessionContext): Promise<string> {
    try {
      if (!this.isAvailable()) {
        return this.messageBuilder.build({
          content: this.i18n.t('errors.ai_unavailable', {}, sessionContext.language),
          footer: this.i18n.t('common.footer_options', {}, sessionContext.language),
          language: sessionContext.language,
        })
      }

      // Détecter l'intention de workflow
      const detectedWorkflow = await this.detectWorkflowIntent(message, sessionContext)

      if (detectedWorkflow) {
        return this.handleWorkflowDetection(detectedWorkflow, sessionContext)
      }

      // Générer une réponse conversationnelle
      return await this.generateConversationalResponse(message, sessionContext)
    } catch (error: any) {
      logger.error('AI Engine error:', error)
      return this.messageBuilder.build({
        content: this.i18n.t('errors.ai_error', {}, sessionContext.language),
        footer: this.i18n.t('common.footer_options', {}, sessionContext.language),
        language: sessionContext.language,
      })
    }
  }

  // Dans detectWorkflowIntent, remplacer cette partie :

  // Solution 1: Utiliser des type guards pour clarifier les types
  private async detectWorkflowIntent(
    message: string,
    sessionContext: SessionContext
  ): Promise<string | null> {
    const workflows = this.workflowRegistry.getUserWorkflows(sessionContext)

    for (const workflow of workflows) {
      if (!workflow.description) continue

      // Type guards pour clarifier les types
      const workflowName = this.getWorkflowName(workflow, sessionContext.language)
      const workflowDesc = this.getWorkflowDescription(workflow, sessionContext.language)

      const isMatch = await this.checkWorkflowMatch(
        message,
        workflowName,
        workflowDesc,
        sessionContext
      )

      if (isMatch) {
        logger.info(`Workflow detected: ${workflow.id}`)
        return workflow.id
      }
    }

    return null
  }

  private async checkWorkflowMatch(
    message: string,
    workflowName: string,
    workflowDescription: string,
    sessionContext: SessionContext
  ): Promise<boolean> {
    if (!this.provider) return false

    const language = sessionContext.language
    const prompt =
      language === 'fr'
        ? `Analyse si cette demande correspond au workflow.
         Workflow: ${workflowName}
         Description: ${workflowDescription}
         Message: "${message}"
         
         Réponds UNIQUEMENT "OUI" ou "NON".`
        : `Analyze if this request matches the workflow.
         Workflow: ${workflowName}
         Description: ${workflowDescription}
         Message: "${message}"
         
         Answer ONLY "YES" or "NO".`

    try {
      const context = await this.contextBuilder.build(sessionContext)
      const response = await this.provider.generateResponse({
        message: prompt,
        context,
        options: { maxTokens: 10, temperature: 0 },
      })

      const positiveWords = language === 'fr' ? ['OUI'] : ['YES']
      return positiveWords.some((word) => response.message.toUpperCase().includes(word))
    } catch {
      return false
    }
  }

  private async handleWorkflowDetection(
    workflowId: string,
    sessionContext: SessionContext
  ): Promise<string> {
    const workflow = this.workflowRegistry.get(workflowId)
    const definition = workflow?.getDefinition()

    if (!definition) {
      return this.generateConversationalResponse('', sessionContext)
    }

    const workflowName =
      typeof definition.name === 'function'
        ? definition.name(sessionContext.language)
        : definition.name

    // Sauvegarder le workflow en attente
    await this.sessionManager.updateSessionContext(sessionContext, {
      workflowData: {
        ...sessionContext.workflowData,
        pendingWorkflow: workflowId,
      },
    })

    return this.messageBuilder.build({
      content: this.i18n.t('ai.workflow_confirm', { workflowName }, sessionContext.language),
      footer: this.i18n.t('ai.confirm_footer', {}, sessionContext.language),
      language: sessionContext.language,
    })
  }

  private async generateConversationalResponse(
    message: string,
    sessionContext: SessionContext
  ): Promise<string> {
    if (!this.provider) {
      return this.messageBuilder.build({
        content: this.i18n.t('errors.ai_unavailable', {}, sessionContext.language),
        footer: this.i18n.t('common.footer_options', {}, sessionContext.language),
        language: sessionContext.language,
      })
    }

    // Récupérer l'historique
    const conversationHistory = await this.getConversationHistory(sessionContext)

    // Construire le contexte
    const context = await this.contextBuilder.build(sessionContext)

    // Créer le prompt complet
    const workflowList = context.availableWorkflows
      .map((w) => {
        const name = typeof w.name === 'function' ? w.name(sessionContext.language) : w.name
        const desc =
          typeof w.description === 'function'
            ? w.description(sessionContext.language)
            : w.description
        return `- ${name}: ${desc}`
      })
      .join('\n')

    const recentHistory = conversationHistory.slice(-10).join('\n')

    const language = sessionContext.language
    const fullPrompt =
      language === 'fr'
        ? `Contexte: Tu es Armelle, assistant fiscal du Cameroun.
         
         RÈGLES IMPORTANTES:
         1. Réponds TOUJOURS en FRANÇAIS
         2. Ne jamais faire le travail des workflows suivants:
         ${workflowList}
         3. Ne jamais mentionner les commandes (menu, armelle, etc.)
         
         Historique récent:
         ${recentHistory}
         
         Question de l'utilisateur: ${message}
         
         Réponds de manière professionnelle et précise sur la fiscalité camerounaise.`
        : `Context: You are Armelle, Cameroon tax assistant.
         
         IMPORTANT RULES:
         1. ALWAYS respond in ENGLISH
         2. Never do the work of these workflows:
         ${workflowList}
         3. Never mention commands (menu, armelle, etc.)
         
         Recent history:
         ${recentHistory}
         
         User question: ${message}
         
         Respond professionally and accurately about Cameroon taxation.`

    // Générer la réponse
    const response = await this.provider.generateResponse({
      message: fullPrompt,
      context,
      options: {
        maxTokens: 500,
        temperature: 0.7,
      },
    })

    // Sauvegarder dans l'historique
    await this.saveToHistory(sessionContext, message, response.message)

    return this.messageBuilder.build({
      content: response.message,
      footer: this.i18n.t('common.footer_options', {}, sessionContext.language),
      language: sessionContext.language,
    })
  }

  private async getConversationHistory(sessionContext: SessionContext): Promise<string[]> {
    const sessionKey = `${sessionContext.channel}:${sessionContext.channelUserId}`

    if (this.conversationCache.has(sessionKey)) {
      return this.conversationCache.get(sessionKey) || []
    }

    try {
      const botSession = await BotSession.findActiveSession(
        sessionContext.channel,
        sessionContext.channelUserId
      )

      if (botSession) {
        const messages = await BotMessage.query()
          .where('bot_session_id', botSession.id)
          .orderBy('created_at', 'desc')
          .limit(20)

        const userLabel = sessionContext.language === 'fr' ? 'Utilisateur' : 'User'
        const assistantLabel = sessionContext.language === 'fr' ? 'Assistant' : 'Assistant'

        const history = messages
          .reverse()
          .map((msg) => `${msg.direction === 'in' ? userLabel : assistantLabel}: ${msg.content}`)

        this.conversationCache.set(sessionKey, history)
        return history
      }
    } catch (error) {
      logger.error('Error loading history:', error)
    }

    return []
  }

  private async saveToHistory(
    sessionContext: SessionContext,
    userMessage: string,
    aiResponse: string
  ): Promise<void> {
    const sessionKey = `${sessionContext.channel}:${sessionContext.channelUserId}`
    const history = this.conversationCache.get(sessionKey) || []

    const userLabel = sessionContext.language === 'fr' ? 'Utilisateur' : 'User'
    const assistantLabel = sessionContext.language === 'fr' ? 'Assistant' : 'Assistant'

    history.push(`${userLabel}: ${userMessage}`)
    history.push(`${assistantLabel}: ${aiResponse}`)

    if (history.length > 20) {
      history.splice(0, history.length - 20)
    }

    this.conversationCache.set(sessionKey, history)
  }

  isAvailable(): boolean {
    return this.initialized && this.provider !== null && this.provider.isAvailable()
  }

  clearSessionCache(sessionContext: SessionContext): void {
    const sessionKey = `${sessionContext.channel}:${sessionContext.channelUserId}`
    this.conversationCache.delete(sessionKey)
  }

  getStats() {
    return {
      available: this.isAvailable(),
      provider: this.provider?.name || 'none',
      cachedSessions: this.conversationCache.size,
    }
  }

  // Méthodes helper avec type guards
  private getWorkflowName(workflow: WorkflowInfo, language: string): string {
    if (typeof workflow.name === 'function') {
      return workflow.name(language as SupportedLanguage)
    }
    return workflow.name
  }

  private getWorkflowDescription(workflow: WorkflowInfo, language: string): string {
    if (!workflow.description) return ''

    if (typeof workflow.description === 'function') {
      return workflow.description(language as SupportedLanguage)
    }
    return workflow.description
  }
}
