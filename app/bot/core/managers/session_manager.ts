import BotUser from '#models/bot/bot_user'
import BotSession from '#models/bot/bot_session'
import botConfig from '#config/bot'
import type { SessionContext, MessageChannel, SupportedLanguage } from '#bot/types/bot_types'

export default class SessionManager {
  private static instance: SessionManager
  private sessionCache: Map<string, SessionContext> = new Map()

  private constructor() {}

  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager()
    }
    return SessionManager.instance
  }

  /**
   * Récupère ou crée une session pour un utilisateur
   */
  public async getOrCreateSession(
    channel: MessageChannel,
    channelUserId: string
  ): Promise<SessionContext> {
    const cacheKey = `${channel}:${channelUserId}`

    // Vérifier le cache d'abord
    const cachedSession = this.sessionCache.get(cacheKey)
    if (cachedSession && !this.isSessionExpired(cachedSession)) {
      return cachedSession
    }

    // Récupérer ou créer l'utilisateur
    const phoneNumber = this.extractPhoneNumber(channelUserId, channel)
    let botUser = await BotUser.query().where('phoneNumber', phoneNumber).first()

    if (!botUser) {
      botUser = await BotUser.create({
        phoneNumber,
        language: botConfig.general.defaultLanguage,
        registrationChannel: channel,
        isActive: true,
        isVerified: false,
        metadata: {},
      })
    }

    // Récupérer ou créer la session
    let botSession = await BotSession.findActiveSession(channel, channelUserId)

    if (!botSession) {
      botSession = await botUser.createSession(channel, channelUserId)
    }

    // Créer le contexte de session
    const sessionContext: SessionContext = {
      userId: botUser.id,
      channel,
      channelUserId,
      currentWorkflow: botSession.currentWorkflow || undefined,
      currentStep: botSession.currentStep || undefined,
      language: botUser.language,
      isVerified: botUser.isVerified,
      workflowData: botSession.currentContext || {},
      lastInteraction: new Date(),
    }

    // Mettre en cache
    this.sessionCache.set(cacheKey, sessionContext)

    return sessionContext
  }

  /**
   * Met à jour le contexte d'une session
   */
  public async updateSessionContext(
    sessionContext: SessionContext,
    updates: Partial<SessionContext>
  ): Promise<void> {
    // Mettre à jour l'objet contexte
    Object.assign(sessionContext, updates, { lastInteraction: new Date() })

    // Persister en base de données
    const botSession = await BotSession.findActiveSession(
      sessionContext.channel,
      sessionContext.channelUserId
    )

    if (botSession) {
      if (updates.currentWorkflow !== undefined) {
        botSession.currentWorkflow = updates.currentWorkflow
      }
      if (updates.currentStep !== undefined) {
        botSession.currentStep = updates.currentStep
      }
      if (updates.workflowData !== undefined) {
        botSession.currentContext = updates.workflowData
      }

      await botSession.recordInteraction()
    }

    // Mettre à jour le cache
    const cacheKey = `${sessionContext.channel}:${sessionContext.channelUserId}`
    this.sessionCache.set(cacheKey, sessionContext)
  }

  /**
   * Met à jour la langue de l'utilisateur
   */
  public async updateUserLanguage(
    sessionContext: SessionContext,
    language: SupportedLanguage
  ): Promise<void> {
    // Mettre à jour l'utilisateur
    const botUser = await BotUser.find(sessionContext.userId)
    if (botUser) {
      await botUser.updateLanguage(language)
    }

    // Mettre à jour le contexte
    await this.updateSessionContext(sessionContext, { language })
  }

  /**
   * Termine un workflow pour une session
   */
  public async endWorkflow(sessionContext: SessionContext): Promise<void> {
    // Nettoyer le contexte
    sessionContext.currentWorkflow = undefined
    sessionContext.currentStep = undefined
    sessionContext.workflowData = {}
    sessionContext.lastInteraction = new Date()

    // Persister en base
    const botSession = await BotSession.findActiveSession(
      sessionContext.channel,
      sessionContext.channelUserId
    )

    if (botSession) {
      botSession.currentWorkflow = null
      botSession.currentStep = null
      botSession.currentContext = {}
      await botSession.save()
    }

    // Mettre à jour le cache
    const cacheKey = `${sessionContext.channel}:${sessionContext.channelUserId}`
    this.sessionCache.set(cacheKey, sessionContext)
  }

  private async getBotSession(sessionContext: SessionContext): Promise<any> {
    return await BotSession.findActiveSession(sessionContext.channel, sessionContext.channelUserId)
  }

  /**
   * Vérifie si une session est expirée
   */
  private isSessionExpired(sessionContext: SessionContext): boolean {
    const now = new Date()
    const timeoutMs = botConfig.sessions.timeoutMinutes * 60 * 1000
    const timeSinceLastInteraction = now.getTime() - sessionContext.lastInteraction.getTime()

    return timeSinceLastInteraction > timeoutMs
  }

  /**
   * Extrait le numéro de téléphone depuis l'ID du canal
   */

  private extractPhoneNumber(channelUserId: string, channel: MessageChannel): string {
    // Vérifier que channelUserId existe
    if (!channelUserId) {
      throw new Error('Channel user ID is undefined')
    }

    switch (channel) {
      case 'whatsapp':
        // WhatsApp format: "237123456789" ou "237123456789@s.whatsapp.net"
        // On garde juste le numéro et on ajoute le +
        const cleanNumber = channelUserId.replace('@s.whatsapp.net', '').replace(/^\+?/, '')
        return `+${cleanNumber}`

      case 'telegram':
        // Pour Telegram, on utilisera l'ID utilisateur préfixé
        return `telegram_${channelUserId}`

      default:
        return channelUserId
    }
  }

  /**
   * Nettoie les sessions expirées du cache
   */
  public cleanupExpiredSessions(): void {
    for (const [key, session] of this.sessionCache.entries()) {
      if (this.isSessionExpired(session)) {
        this.sessionCache.delete(key)
      }
    }
  }

  /**
   * Démarre un workflow pour une session
   */
  public async startWorkflow(
    sessionContext: SessionContext,
    workflowId: string,
    initialStep: string
  ): Promise<void> {
    // Mettre à jour le contexte
    sessionContext.currentWorkflow = workflowId
    sessionContext.currentStep = initialStep
    sessionContext.workflowData = {} // Reset des données
    sessionContext.lastInteraction = new Date()

    // Persister en base
    const botSession = await BotSession.findActiveSession(
      sessionContext.channel,
      sessionContext.channelUserId
    )

    if (botSession) {
      botSession.currentWorkflow = workflowId
      botSession.currentStep = initialStep
      botSession.currentContext = {}
      await botSession.save()
    }

    // Mettre à jour le cache
    const cacheKey = `${sessionContext.channel}:${sessionContext.channelUserId}`
    this.sessionCache.set(cacheKey, sessionContext)
  }

  /**
   * Met à jour l'étape actuelle du workflow
   */
  public async updateWorkflowStep(
    sessionContext: SessionContext,
    stepId: string,
    data?: Record<string, any>
  ): Promise<void> {
    // Mettre à jour le contexte
    sessionContext.currentStep = stepId
    if (data) {
      sessionContext.workflowData = { ...sessionContext.workflowData, ...data }
    }
    sessionContext.lastInteraction = new Date()

    // Persister en base
    const botSession = await BotSession.findActiveSession(
      sessionContext.channel,
      sessionContext.channelUserId
    )

    if (botSession) {
      botSession.currentStep = stepId
      if (data) {
        botSession.currentContext = { ...botSession.currentContext, ...data }
      }
      await botSession.save()
    }

    // Mettre à jour le cache
    const cacheKey = `${sessionContext.channel}:${sessionContext.channelUserId}`
    this.sessionCache.set(cacheKey, sessionContext)
  }

  /**
   * Récupère les données du workflow en cours
   */
  public getWorkflowData(sessionContext: SessionContext): Record<string, any> {
    return sessionContext.workflowData || {}
  }

  /**
   * Met à jour les données du workflow
   */
  public async updateWorkflowData(
    sessionContext: SessionContext,
    data: Record<string, any>
  ): Promise<void> {
    // Mettre à jour le contexte
    sessionContext.workflowData = { ...sessionContext.workflowData, ...data }
    sessionContext.lastInteraction = new Date()

    // Persister en base
    const botSession = await BotSession.findActiveSession(
      sessionContext.channel,
      sessionContext.channelUserId
    )

    if (botSession) {
      botSession.currentContext = { ...botSession.currentContext, ...data }
      await botSession.save()
    }

    // Mettre à jour le cache
    const cacheKey = `${sessionContext.channel}:${sessionContext.channelUserId}`
    this.sessionCache.set(cacheKey, sessionContext)
  }
}
