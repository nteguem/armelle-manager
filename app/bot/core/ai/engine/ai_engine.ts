import { AnthropicProvider } from '../providers/anthropic_provider.js'
import ContextBuilder from '../processors/context_builder.js'
import I18nManager from '#bot/core/managers/i18n_manager'
import MessageBuilder from '#bot/core/managers/message_builder'
import SessionManager from '#bot/core/managers/session_manager'
import { WorkflowRegistry } from '#bot/core/workflow/registry/workflow_registry'
import type { AIProvider, AIRequest, AIResponse } from '#bot/types/ai_types'
import type { SessionContext } from '#bot/types/bot_types'
import logger from '@adonisjs/core/services/logger'

export default class AIEngine {
  private static instance: AIEngine
  private provider: AIProvider | null = null
  private contextBuilder: ContextBuilder
  private i18n: I18nManager
  private messageBuilder: MessageBuilder
  private sessionManager: SessionManager
  private workflowRegistry: WorkflowRegistry
  private initialized = false

  private constructor() {
    this.contextBuilder = new ContextBuilder()
    this.i18n = I18nManager.getInstance()
    this.messageBuilder = new MessageBuilder()
    this.sessionManager = SessionManager.getInstance()
    this.workflowRegistry = WorkflowRegistry.getInstance()
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
        apiKey: process.env.ANTHROPIC_API_KEY,
      })
    }

    this.initialized = true
    logger.info(`AI Engine initialized with ${providerName}`)
  }

  async processMessage(message: string, sessionContext: SessionContext): Promise<string> {
    try {
      if (!this.isAvailable()) {
        return this.buildErrorMessage('errors.ai_unavailable', sessionContext)
      }

      // Construire le contexte
      const context = await this.contextBuilder.build(sessionContext)

      // Créer la requête pour l'IA
      const request: AIRequest = {
        message,
        context,
        options: {
          maxTokens: 400,
          temperature: 0.3,
        },
      }

      // Appeler l'IA - C'est elle qui décide !
      const response = await this.provider!.generateResponse(request)

      // Vérifier si l'IA propose une action
      const proposesAction = this.isProposingAction(response.message, sessionContext.language)

      if (proposesAction) {
        // L'IA a détecté un workflow, on doit juste trouver lequel
        const workflow = this.findWorkflowFromAIResponse(response.message, sessionContext)

        if (workflow) {
          await this.savePendingWorkflow(sessionContext, workflow)
          logger.info(
            {
              sessionKey: `${sessionContext.channel}:${sessionContext.channelUserId}`,
              detectedWorkflow: workflow,
            },
            'Workflow detected by AI'
          )
        } else {
          logger.warn('AI proposed action but workflow not found in registry')
        }

        return this.buildConfirmationMessage(response.message, sessionContext)
      }

      // Conversation normale
      return this.buildConversationalMessage(response.message, sessionContext)
    } catch (error: any) {
      logger.error('AI Engine error:', error)
      return this.buildErrorMessage('errors.ai_error', sessionContext)
    }
  }

  private isProposingAction(response: string, language: string): boolean {
    const patterns =
      language === 'fr' ? /je peux.*souhaitez-vous continuer/i : /i can.*would you like to proceed/i
    return patterns.test(response)
  }

  /**
   * Trouve quel workflow l'IA a identifié en comparant avec les noms des workflows
   * L'IA a déjà fait le travail de détection, on cherche juste lequel c'est
   */
  private findWorkflowFromAIResponse(response: string, sessionContext: SessionContext): any {
    const workflows = this.workflowRegistry.getUserWorkflows(sessionContext)
    const lang = sessionContext.language
    const responseLower = response.toLowerCase()

    // L'IA dit "Je peux [action]", on cherche quelle action correspond à quel workflow
    for (const workflow of workflows) {
      // Assertion de type pour éviter l'erreur 'never'
      const w = workflow as any
      const workflowName = typeof w.name === 'function' ? w.name(lang) : w.name
      const workflowNameLower = workflowName.toLowerCase()

      // Si le nom du workflow est mentionné dans la réponse de l'IA
      if (responseLower.includes(workflowNameLower)) {
        return {
          id: w.id,
          name: workflowName,
        }
      }

      // Vérifier aussi avec des parties du nom
      const nameWords = workflowNameLower
        .split(' ')
        .filter((word: string | any[]) => word.length > 3)
      let matchCount = 0
      for (const word of nameWords) {
        if (responseLower.includes(word)) {
          matchCount++
        }
      }

      // Si la majorité des mots du nom sont présents
      if (nameWords.length > 0 && matchCount >= Math.ceil(nameWords.length * 0.6)) {
        return {
          id: w.id,
          name: workflowName,
        }
      }
    }

    // En dernier recours, chercher par parties de l'ID
    for (const workflow of workflows) {
      // Assertion de type pour éviter l'erreur 'never'
      const w = workflow as any
      const idParts = w.id.toLowerCase().split('_')
      let found = true

      for (const part of idParts) {
        if (part.length > 2 && !responseLower.includes(part)) {
          found = false
          break
        }
      }

      if (found) {
        const workflowName = typeof w.name === 'function' ? w.name(lang) : w.name
        return {
          id: w.id,
          name: workflowName,
        }
      }
    }

    logger.warn(
      {
        response: responseLower.substring(0, 100),
        availableWorkflows: workflows.map((w) => {
          // Assertion de type pour éviter l'erreur 'never'
          const workflow = w as any
          return {
            id: workflow.id,
            name: typeof workflow.name === 'function' ? workflow.name(lang) : workflow.name,
          }
        }),
      },
      'Could not match AI response to any workflow'
    )

    return null
  }

  private async savePendingWorkflow(sessionContext: SessionContext, workflow: any): Promise<void> {
    await this.sessionManager.updateSessionContext(sessionContext, {
      workflowData: {
        ...sessionContext.workflowData,
        pendingWorkflow: workflow.id,
        pendingWorkflowName: workflow.name,
      },
    })
  }

  private buildConfirmationMessage(response: string, sessionContext: SessionContext): string {
    const hasInstructions = /répondez.*oui.*non|reply.*yes.*no/i.test(response)

    let fullMessage = response
    if (!hasInstructions) {
      const instructions =
        sessionContext.language === 'fr'
          ? '\n\nRépondez "oui" pour commencer ou "non" pour continuer notre conversation.'
          : '\n\nReply "yes" to start or "no" to continue our conversation.'
      fullMessage += instructions
    }

    return this.messageBuilder.build({
      content: fullMessage,
      footer: this.i18n.t('common.footer_options', {}, sessionContext.language),
      language: sessionContext.language,
    })
  }

  private buildConversationalMessage(response: string, sessionContext: SessionContext): string {
    return this.messageBuilder.build({
      content: response,
      footer: this.i18n.t('common.footer_options', {}, sessionContext.language),
      language: sessionContext.language,
    })
  }

  private buildErrorMessage(errorKey: string, sessionContext: SessionContext): string {
    return this.messageBuilder.build({
      content: this.i18n.t(errorKey, {}, sessionContext.language),
      footer: this.i18n.t('common.footer_options', {}, sessionContext.language),
      language: sessionContext.language,
    })
  }

  isAvailable(): boolean {
    return this.initialized && this.provider !== null && this.provider.isAvailable()
  }

  getStats() {
    return {
      available: this.isAvailable(),
      provider: this.provider?.name || 'none',
    }
  }

  clearSessionCache(sessionContext: SessionContext): void {
    // Pas de cache pour le moment
  }

  cleanup(): void {
    this.provider = null
    this.initialized = false
  }
}
