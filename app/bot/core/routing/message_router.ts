// app/bot/core/routing/message_router.ts

import CommandManager from '#bot/core/managers/command_manager'
import SessionManager from '#bot/core/managers/session_manager'
import WorkflowEngine from '#bot/core/workflow/engine/workflow_engine'
import AIEngine from '#bot/core/ai/engine/ai_engine'
import { WorkflowRegistry } from '#bot/core/workflow/registry/workflow_registry'
import MessageBuilder from '#bot/core/managers/message_builder'
import I18nManager from '#bot/core/managers/i18n_manager'
import BotMessage from '#models/bot/bot_message'
import BotSession from '#models/bot/bot_session'
import type {
  IncomingMessage,
  OutgoingMessage,
  SessionContext,
  ChannelAdapter,
} from '#bot/types/bot_types'

/**
 * Router principal qui décide comment traiter chaque message
 */
export default class MessageRouter {
  private commandManager: CommandManager
  private sessionManager: SessionManager
  private workflowEngine: WorkflowEngine
  private aiEngine: AIEngine
  private messageBuilder: MessageBuilder
  private i18n: I18nManager
  private adapters: Map<string, ChannelAdapter> = new Map()

  constructor() {
    this.commandManager = CommandManager.getInstance()
    this.sessionManager = SessionManager.getInstance()
    this.workflowEngine = WorkflowEngine.getInstance()
    this.aiEngine = AIEngine.getInstance()
    this.messageBuilder = new MessageBuilder()
    this.i18n = I18nManager.getInstance()
  }

  /**
   * Enregistre un adaptateur de canal
   */
  public registerAdapter(channel: string, adapter: ChannelAdapter): void {
    this.adapters.set(channel, adapter)
  }

  /**
   * Point d'entrée principal pour tous les messages
   */
  public async handleIncomingMessage(message: IncomingMessage): Promise<void> {
    const startTime = Date.now()

    try {
      // 1. Récupérer ou créer la session
      const sessionContext = await this.sessionManager.getOrCreateSession(
        message.channel,
        message.from
      )

      // 2. Récupérer la session BotSession pour les méthodes BotMessage
      const botSession = await BotSession.findActiveSession(message.channel, message.from)

      if (!botSession) {
        throw new Error('Failed to get or create bot session')
      }

      // 3. Sauvegarder le message entrant avec BotMessage.createIncoming
      const incomingMsg = await BotMessage.createIncoming({
        session: botSession,
        content: message.text,
        messageType: message.type,
        rawData: message.metadata || {},
      })

      // 4. Router le message selon le contexte
      const response = await this.routeMessage(message, sessionContext)

      // 5. Envoyer la réponse si présente
      if (response) {
        await this.sendResponse(response, message, sessionContext, botSession)
      }

      // 6. Marquer le message comme traité
      const processingTime = Date.now() - startTime
      await incomingMsg.markAsProcessed(processingTime)
    } catch (error: any) {
      console.error('Error handling message:', error)

      // Envoyer un message d'erreur
      await this.sendErrorMessage(message, error.message)
    }
  }

  /**
   * Logique de routage principale
   */

  private async routeMessage(
    message: IncomingMessage,
    sessionContext: SessionContext
  ): Promise<string | null> {
    const input = message.text.trim()

    // 1. Commandes système
    const commandResult = this.commandManager.detectCommand(input, sessionContext)

    if (commandResult.detected) {
      if (commandResult.blocked) {
        return (
          commandResult.reason ||
          this.i18n.t('errors.commands.not_allowed_in_context', {}, sessionContext.language)
        )
      }
      return await this.handleCommand(commandResult.type!, sessionContext)
    }

    // 2. Workflow actif
    if (sessionContext.currentWorkflow) {
      const result = await this.workflowEngine.processInput(input, sessionContext)

      // Si c'est l'onboarding et qu'on vient de saisir le nom
      if (
        sessionContext.currentWorkflow === 'onboarding' &&
        result.success &&
        result.message?.includes('Vérification de votre identité')
      ) {
        // Envoyer le message de transition
        await this.sendDelayedMessage(result.message!, message, sessionContext)

        // Attendre un peu pour simuler la recherche
        await new Promise((resolve) => setTimeout(resolve, 1500))

        // Continuer le workflow pour obtenir les résultats
        const nextResult = await this.workflowEngine.processInput('', sessionContext)

        if (nextResult.message) {
          return nextResult.message
        }
      }

      // Workflow terminé
      if (result.complete) {
        await this.sessionManager.endWorkflow(sessionContext)

        // Pour l'onboarding, le message de completion est déjà formaté
        if (sessionContext.currentWorkflow === 'onboarding') {
          return result.message || ''
        }

        // Autres workflows
        const completionMessage =
          result.message || this.i18n.t('workflows.common.completed', {}, sessionContext.language)

        return completionMessage
      }

      return result.message || null
    }

    // 3. Nouveau user = onboarding
    if (!sessionContext.isVerified) {
      const result = this.workflowEngine.startWorkflow('onboarding', sessionContext)

      if (result.success) {
        await this.sessionManager.startWorkflow(sessionContext, 'onboarding', 'collect_name')
        return result.message || null
      }
    }

    // 4. Confirmation workflow en attente
    if (this.isWorkflowConfirmation(input, sessionContext)) {
      return await this.handleWorkflowConfirmation(input, sessionContext)
    }

    // 5. IA
    try {
      const aiResponse = await this.aiEngine.processMessage(input, sessionContext)
      return aiResponse
    } catch (error) {
      console.error('AI processing error:', error)
      return this.messageBuilder.build({
        content: this.i18n.t('common.central_state_prompt', {}, sessionContext.language),
        footer: this.i18n.t('common.footer_options', {}, sessionContext.language),
        language: sessionContext.language,
      })
    }
  }

  // Nouvelle méthode pour envoyer un message intermédiaire
  private async sendDelayedMessage(
    content: string,
    originalMessage: IncomingMessage,
    sessionContext: SessionContext
  ): Promise<void> {
    const botSession = await BotSession.findActiveSession(
      originalMessage.channel,
      originalMessage.from
    )

    if (botSession) {
      await BotMessage.createOutgoing({
        session: botSession,
        content: content,
        messageType: 'text',
      })

      const adapter = this.adapters.get(originalMessage.channel)
      if (adapter) {
        const outgoingMessage: OutgoingMessage = {
          to: originalMessage.from,
          text: content,
          type: 'text',
        }
        await adapter.sendMessage(outgoingMessage)
      }
    }
  }

  /**
   * Traite les commandes système
   */
  private async handleCommand(
    commandType: string,
    sessionContext: SessionContext
  ): Promise<string> {
    switch (commandType) {
      case 'menu':
        return this.buildMenuMessage(sessionContext)

      case 'armelle':
        // Annuler workflow actif si présent
        if (sessionContext.currentWorkflow) {
          this.workflowEngine.cancelWorkflow(sessionContext)
          await this.sessionManager.endWorkflow(sessionContext)
        }

        return this.messageBuilder.build({
          content: this.i18n.t('common.central_state_prompt', {}, sessionContext.language),
          footer: this.i18n.t('common.footer_options', {}, sessionContext.language),
          language: sessionContext.language,
        })

      case 'fr':
      case 'en':
        const newLanguage = commandType === 'fr' ? 'fr' : 'en'
        await this.sessionManager.updateUserLanguage(sessionContext, newLanguage as any)

        return this.i18n.t('common.language_changed', {}, newLanguage as any)

      default:
        return this.i18n.t('errors.unknown_command', {}, sessionContext.language)
    }
  }

  /**
   * Vérifie si le message est une confirmation de workflow
   */
  private isWorkflowConfirmation(input: string, sessionContext: SessionContext): boolean {
    const pendingWorkflow = sessionContext.workflowData?.pendingWorkflow
    if (!pendingWorkflow) return false

    const normalizedInput = input.toLowerCase().trim()
    const confirmWords = ['oui', 'yes', 'ok', "d'accord", 'daccord', 'commence', 'start']
    const denyWords = ['non', 'no', 'pas', 'annule', 'cancel']

    return (
      confirmWords.some((word) => normalizedInput.includes(word)) ||
      denyWords.some((word) => normalizedInput.includes(word))
    )
  }

  /**
   * Traite la confirmation d'un workflow suggéré
   */
  private async handleWorkflowConfirmation(
    input: string,
    sessionContext: SessionContext
  ): Promise<string> {
    const normalizedInput = input.toLowerCase().trim()
    const pendingWorkflow = sessionContext.workflowData?.pendingWorkflow

    if (!pendingWorkflow) {
      // Pas de workflow en attente, traiter normalement par l'IA
      return await this.aiEngine.processMessage(input, sessionContext)
    }

    // Vérifier si c'est une confirmation positive
    const confirmWords = ['oui', 'yes', 'ok', "d'accord", 'daccord', 'commence', 'start']
    const denyWords = ['non', 'no', 'pas', 'annule', 'cancel']

    const isConfirmed = confirmWords.some((word) => normalizedInput.includes(word))
    const isDenied = denyWords.some((word) => normalizedInput.includes(word))

    // Nettoyer la suggestion en attente
    await this.sessionManager.updateSessionContext(sessionContext, {
      workflowData: { ...sessionContext.workflowData, pendingWorkflow: undefined },
    })

    if (isConfirmed && !isDenied) {
      // Lancer le workflow
      const result = this.workflowEngine.startWorkflow(pendingWorkflow, sessionContext)

      if (result.success) {
        await this.sessionManager.startWorkflow(sessionContext, pendingWorkflow, 'initial')
        return result.message || ''
      }
    }

    // Si refusé ou ambigu, continuer la conversation avec l'IA
    return await this.aiEngine.processMessage(input, sessionContext)
  }

  /**
   * Construit le message du menu
   */
  private buildMenuMessage(sessionContext: SessionContext): string {
    const workflowRegistry = WorkflowRegistry.getInstance()
    const availableWorkflows = workflowRegistry.listAvailable().filter((w) => w.id !== 'onboarding') // Cacher les workflows système

    const menuItems = availableWorkflows
      .map((workflow, index) => {
        const description = workflow.description || workflow.id
        return `${index + 1}. ${this.i18n.t(`workflows.${workflow.id}.name`, {}, sessionContext.language)}`
      })
      .join('\n')

    const content = `${this.i18n.t('menu.title', {}, sessionContext.language)}\n\n${menuItems}\n\n0. ${this.i18n.t('menu.back_to_assistant', {}, sessionContext.language)}`

    return this.messageBuilder.build({
      content,
      footer: this.i18n.t('menu.footer', {}, sessionContext.language),
      language: sessionContext.language,
    })
  }

  /**
   * Envoie une réponse en utilisant BotMessage.createOutgoing
   */
  private async sendResponse(
    content: string,
    originalMessage: IncomingMessage,
    sessionContext: SessionContext,
    botSession: BotSession
  ): Promise<void> {
    // 1. Sauvegarder le message sortant avec BotMessage.createOutgoing
    await BotMessage.createOutgoing({
      session: botSession,
      content: content,
      messageType: 'text',
    })

    // 2. Envoyer via l'adaptateur
    const adapter = this.adapters.get(originalMessage.channel)
    if (!adapter) {
      throw new Error(`No adapter for channel: ${originalMessage.channel}`)
    }

    const outgoingMessage: OutgoingMessage = {
      to: originalMessage.from,
      text: content,
      type: 'text',
    }

    await adapter.sendMessage(outgoingMessage)
  }

  /**
   * Envoie un message d'erreur
   */
  private async sendErrorMessage(
    originalMessage: IncomingMessage,
    errorDetails?: string
  ): Promise<void> {
    const adapter = this.adapters.get(originalMessage.channel)
    if (!adapter) return

    const errorMessage: OutgoingMessage = {
      to: originalMessage.from,
      text: "Désolé, une erreur s'est produite. Veuillez réessayer.",
      type: 'text',
    }

    try {
      await adapter.sendMessage(errorMessage)
    } catch (error) {
      console.error('Failed to send error message:', error)
    }
  }
}
