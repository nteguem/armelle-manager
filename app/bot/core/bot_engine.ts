import { DateTime } from 'luxon'
import BotMessage from '#models/bot_message'
import BotSession from '#models/bot_session'
import BotUser from '#models/bot_user'
import I18nManager from './i18n_manager.js'
import MessageBuilder from './message_builder.js'
import ContextManager from './context_manager.js'
import SystemCommandHandler from './commands/system_command_handler.js'
import type { IncomingMessage, OutgoingMessage } from '#bot/types/bot_types'

/**
 * Moteur principal du bot
 * Orchestre le traitement des messages et la gestion des workflows
 */
export default class BotEngine {
  private readonly i18n: I18nManager
  private readonly messageBuilder: MessageBuilder
  private readonly contextManager: ContextManager
  private readonly systemCommandHandler: SystemCommandHandler

  constructor() {
    this.i18n = I18nManager.getInstance()
    this.messageBuilder = new MessageBuilder()
    this.contextManager = new ContextManager()
    this.systemCommandHandler = new SystemCommandHandler()
  }

  /**
   * Initialise le moteur du bot
   */
  public async initialize(): Promise<void> {
    await this.i18n.initialize()
    console.log('🤖 Bot Engine initialized')
  }

  /**
   * Traite un message entrant
   */
  public async processMessage(message: IncomingMessage): Promise<OutgoingMessage> {
    const startTime = Date.now()

    try {
      // 1. Récupérer ou créer la session
      const { session, isNew } = await this.contextManager.getOrCreateSession(
        message.channel,
        message.channelUserId
      )

      // 2. Sauvegarder le message entrant
      await this.saveIncomingMessage(message, session)

      // 3. Traiter le message et générer la réponse
      const response = await this.generateResponse(message, session, isNew)

      // 4. Sauvegarder le message sortant
      await this.saveOutgoingMessage(response, session)

      // 5. Marquer le message comme traité avec succès
      const processingTime = Date.now() - startTime
      await this.markMessageAsProcessed(message, session, processingTime)

      console.log(`✅ Message processed in ${processingTime}ms`)
      return response
    } catch (error) {
      const processingTime = Date.now() - startTime
      console.error('❌ Error processing message:', error)

      // Marquer comme erreur si session disponible
      try {
        const session = await BotSession.findActiveSession(message.channel, message.channelUserId)
        if (session) {
          await this.markMessageAsError(message, session, error as Error, processingTime)
        }
      } catch {
        // Ignorer erreur de logging
      }

      // Retourner message d'erreur générique
      return this.createErrorResponse(message)
    }
  }

  /**
   * Génère la réponse appropriée
   */
  private async generateResponse(
    message: IncomingMessage,
    session: BotSession,
    isNewSession: boolean
  ): Promise<OutgoingMessage> {
    const botUser = await session.related('botUser').query().firstOrFail()

    // 1. Traiter commandes système en priorité
    const systemResponse = await this.systemCommandHandler.handle(session, message.content)
    if (systemResponse) {
      return this.createOutgoingMessage(message, systemResponse, botUser.language)
    }

    // 2. Si nouvelle session, démarrer onboarding
    if (isNewSession || !botUser.isVerified) {
      return await this.handleNewUser(message, session, botUser)
    }

    // 3. Si pas de workflow actuel, afficher menu principal
    if (!session.currentWorkflow) {
      return await this.handleMainMenu(message, botUser)
    }

    // 4. Continuer le workflow en cours
    // TODO: Déléguer au workflow engine
    return await this.handleWorkflowContinuation(message, session, botUser)
  }

  /**
   * Gère un nouvel utilisateur (onboarding)
   */
  private async handleNewUser(
    message: IncomingMessage,
    session: BotSession,
    botUser: BotUser
  ): Promise<OutgoingMessage> {
    // Démarrer le workflow d'onboarding
    await this.contextManager.startWorkflow(session.id, 'onboarding', 'welcome')

    const responseText = this.messageBuilder.buildWorkflowStep(
      'workflows.onboarding',
      'welcome',
      1,
      4,
      botUser.language,
      {
        name: botUser.fullName,
      }
    )

    return this.createOutgoingMessage(message, responseText, botUser.language)
  }

  /**
   * Affiche le menu principal
   */
  private async handleMainMenu(
    message: IncomingMessage,
    botUser: BotUser
  ): Promise<OutgoingMessage> {
    const responseText = this.messageBuilder.buildMenu('common.main_menu', botUser.language, {
      userName: botUser.fullName,
    })

    return this.createOutgoingMessage(message, responseText, botUser.language)
  }

  /**
   * Continue le workflow en cours
   */
  private async handleWorkflowContinuation(
    message: IncomingMessage,
    session: BotSession,
    botUser: BotUser
  ): Promise<OutgoingMessage> {
    // Pour l'instant, réponse simple en attendant le workflow engine
    const responseText = this.messageBuilder.build({
      content: 'common.workflow_in_progress',
      subheader: 'common.development_notice',
      footer: 'common.navigation_footer',
      language: botUser.language,
      params: {
        workflow: session.currentWorkflow,
        step: session.currentStep,
        input: message.content,
      },
    })

    return this.createOutgoingMessage(message, responseText, botUser.language)
  }

  /**
   * Sauvegarde un message entrant
   */
  private async saveIncomingMessage(
    message: IncomingMessage,
    session: BotSession
  ): Promise<BotMessage> {
    const sessionBotUser = await session.related('botUser').query().firstOrFail()

    return await BotMessage.create({
      sessionId: session.id,
      botUserId: session.botUserId,
      direction: 'in',
      messageType: message.messageType,
      content: message.content,
      structuredContent: {},
      language: sessionBotUser.language,
      rawData: message.rawData,
      channelMessageId: message.rawData.messageId,
      workflowId: session.currentWorkflow,
      stepId: session.currentStep,
      contextSnapshot: session.currentContext,
      isProcessed: false,
      isSystemMessage: false,
    })
  }

  /**
   * Sauvegarde un message sortant
   */
  private async saveOutgoingMessage(
    message: OutgoingMessage,
    session: BotSession
  ): Promise<BotMessage> {
    return await BotMessage.create({
      sessionId: session.id,
      botUserId: session.botUserId,
      direction: 'out',
      messageType: message.messageType,
      content: message.content,
      structuredContent: message.structuredContent || {},
      language: message.language,
      rawData: {},
      channelMessageId: null,
      workflowId: session.currentWorkflow,
      stepId: session.currentStep,
      contextSnapshot: session.currentContext,
      isProcessed: true,
      processedAt: DateTime.now(),
      isSystemMessage: false,
    })
  }

  /**
   * Marque un message comme traité avec succès
   */
  private async markMessageAsProcessed(
    message: IncomingMessage,
    session: BotSession,
    processingTimeMs: number
  ): Promise<void> {
    const botMessage = await BotMessage.query()
      .where('sessionId', session.id)
      .where('direction', 'in')
      .where('content', message.content)
      .orderBy('createdAt', 'desc')
      .first()

    if (botMessage) {
      await botMessage.markAsProcessed(processingTimeMs)
    }
  }

  /**
   * Marque un message comme échoué
   */
  private async markMessageAsError(
    message: IncomingMessage,
    session: BotSession,
    error: Error,
    processingTimeMs: number
  ): Promise<void> {
    const botMessage = await BotMessage.query()
      .where('sessionId', session.id)
      .where('direction', 'in')
      .where('content', message.content)
      .orderBy('createdAt', 'desc')
      .first()

    if (botMessage) {
      await botMessage.markAsError(error.message, processingTimeMs)
    }
  }

  /**
   * Crée un message sortant
   */
  private createOutgoingMessage(
    originalMessage: IncomingMessage,
    content: string,
    language: string
  ): OutgoingMessage {
    return {
      to: originalMessage.channelUserId,
      content,
      language: language as 'fr' | 'en',
      messageType: 'text',
    }
  }

  /**
   * Crée un message d'erreur générique
   */
  private createErrorResponse(message: IncomingMessage): OutgoingMessage {
    const errorText = this.messageBuilder.buildError(
      'errors.generic_error',
      'fr' // Fallback vers français
    )

    return this.createOutgoingMessage(message, errorText, 'fr')
  }

  /**
   * Récupère les statistiques du moteur
   */
  public async getStats(): Promise<{
    totalMessages: number
    averageProcessingTime: number
    errorRate: number
    activeUsers: number
    activeSessions: number
  }> {
    const [activeUsers, activeSessions] = await Promise.all([
      BotUser.active().count('* as total'),
      BotSession.active().count('* as total'),
    ])

    const messageStats = await BotMessage.getPerformanceStats(24)

    return {
      totalMessages: messageStats.totalMessages,
      averageProcessingTime: messageStats.averageProcessingTime,
      errorRate: messageStats.errorRate,
      activeUsers: Number(activeUsers[0].$extras.total),
      activeSessions: Number(activeSessions[0].$extras.total),
    }
  }

  /**
   * Nettoie les ressources (sessions expirées, etc.)
   */
  public async cleanup(): Promise<{
    expiredSessions: number
  }> {
    const expiredSessions = await this.contextManager.cleanupExpiredSessions()

    console.log(`🧹 Cleanup completed: ${expiredSessions} expired sessions`)

    return {
      expiredSessions,
    }
  }
}
