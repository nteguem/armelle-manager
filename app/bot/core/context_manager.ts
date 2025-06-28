import { DateTime } from 'luxon'
import BotUser from '#models/bot_user'
import BotSession from '#models/bot_session'
import type {
  MessageChannel,
  SupportedLanguage,
  SessionContext,
  ContextManager as IContextManager,
} from '#bot/types/bot_types'

export default class ContextManager implements IContextManager {
  public async getOrCreateBotUser(
    phoneNumber: string,
    fullName: string,
    channel: MessageChannel,
    language: SupportedLanguage = 'fr'
  ): Promise<BotUser> {
    let botUser = await BotUser.findByPhone(phoneNumber)

    if (!botUser) {
      botUser = await BotUser.create({
        phoneNumber,
        fullName,
        language,
        registrationChannel: channel,
        isActive: true,
        isVerified: false,
      })
    }

    return botUser
  }

  public async getSession(
    channel: MessageChannel,
    channelUserId: string
  ): Promise<SessionContext | null> {
    const session = await BotSession.findActiveSession(channel, channelUserId)

    if (!session || session.isExpired()) {
      return null
    }

    await session.updateActivity()
    return session.getFullContext()
  }

  public async createSession(
    channel: MessageChannel,
    channelUserId: string
  ): Promise<SessionContext> {
    // Désactiver les anciennes sessions
    const oldSessions = await BotSession.query()
      .where('channel', channel)
      .where('channelUserId', channelUserId)
      .where('isActive', true)

    for (const oldSession of oldSessions) {
      oldSession.isActive = false
      await oldSession.save()
    }

    // Trouver ou créer l'utilisateur bot
    const botUser = await this.findOrCreateUserFromChannel(channel, channelUserId)

    // Créer nouvelle session
    const session = await BotSession.create({
      botUserId: botUser.id,
      channel,
      channelUserId,
      currentWorkflow: null,
      currentStep: null,
      currentContext: {},
      persistentContext: {},
      navigationStack: [],
      workflowHistory: {
        completed: [],
        abandoned: [],
        currentPath: [],
        totalWorkflows: 0,
      },
      activeWorkflows: [],
      isActive: true,
      lastActivityAt: DateTime.now(),
      lastInteractionAt: DateTime.now(),
      messageCount: 0,
    })

    // Définir expiration par défaut
    await session.setExpiration(24) // 24 heures

    return session.getFullContext()
  }

  public async updateSession(sessionId: string, updates: Partial<SessionContext>): Promise<void> {
    const session = await BotSession.findOrFail(sessionId)

    // Appliquer les mises à jour
    if (updates.current !== undefined) {
      session.currentContext = updates.current
    }

    if (updates.persistent !== undefined) {
      session.persistentContext = updates.persistent
    }

    if (updates.navigationStack !== undefined) {
      session.navigationStack = [...updates.navigationStack]
    }

    if (updates.workflowHistory !== undefined) {
      session.workflowHistory = updates.workflowHistory
    }

    if (updates.activeWorkflows !== undefined) {
      session.activeWorkflows = [...updates.activeWorkflows]
    }

    await session.save()
  }

  public async expireSession(sessionId: string): Promise<void> {
    const session = await BotSession.findOrFail(sessionId)
    session.isActive = false
    session.expiresAt = DateTime.now()
    await session.save()
  }

  public async getOrCreateSession(
    channel: MessageChannel,
    channelUserId: string
  ): Promise<{ session: BotSession; context: SessionContext; isNew: boolean }> {
    let session = await BotSession.findActiveSession(channel, channelUserId)
    let isNew = false

    if (!session || session.isExpired()) {
      // Créer nouvelle session
      const context = await this.createSession(channel, channelUserId)
      session = await BotSession.findActiveSession(channel, channelUserId)
      isNew = true

      if (!session) {
        throw new Error('Failed to create session')
      }

      return { session, context, isNew }
    }

    // Session existante
    await session.updateActivity()
    const context = session.getFullContext()

    return { session, context, isNew }
  }

  public async changeLanguage(sessionId: string, language: SupportedLanguage): Promise<void> {
    const session = await BotSession.findOrFail(sessionId)
    const botUser = await session.related('botUser').query().firstOrFail()

    // Mettre à jour l'utilisateur
    await botUser.setLanguage(language)

    // Mettre à jour le contexte persistant
    await session.setPersistentData('language', language)
  }

  public async startWorkflow(
    sessionId: string,
    workflowId: string,
    stepId: string,
    initialContext: Record<string, any> = {}
  ): Promise<void> {
    const session = await BotSession.findOrFail(sessionId)
    await session.startWorkflow(workflowId, stepId)

    // Ajouter contexte initial
    session.currentContext = { ...session.currentContext, ...initialContext }
    await session.save()
  }

  public async moveToStep(
    sessionId: string,
    stepId: string,
    context: Record<string, any> = {}
  ): Promise<void> {
    const session = await BotSession.findOrFail(sessionId)
    await session.moveToStep(stepId, context)
  }

  public async goBack(sessionId: string): Promise<boolean> {
    const session = await BotSession.findOrFail(sessionId)
    return await session.goBack()
  }

  public async completeWorkflow(sessionId: string): Promise<void> {
    const session = await BotSession.findOrFail(sessionId)
    await session.completeWorkflow()
  }

  public async abandonWorkflow(sessionId: string): Promise<void> {
    const session = await BotSession.findOrFail(sessionId)
    await session.abandonWorkflow()
  }

  public async getSessionStats(sessionId: string): Promise<{
    messageCount: number
    workflowsCompleted: number
    workflowsAbandoned: number
    navigationDepth: number
    sessionDuration: number
  }> {
    const session = await BotSession.findOrFail(sessionId)

    const sessionDuration = DateTime.now().diff(session.createdAt, 'minutes').minutes

    return {
      messageCount: session.messageCount,
      workflowsCompleted: session.workflowHistory.completed.length,
      workflowsAbandoned: session.workflowHistory.abandoned.length,
      navigationDepth: session.navigationStack.length,
      sessionDuration: Math.round(sessionDuration),
    }
  }

  public async cleanupExpiredSessions(): Promise<number> {
    const expiredSessions = await BotSession.expired()

    for (const session of expiredSessions) {
      session.isActive = false
      await session.save()
    }

    return expiredSessions.length
  }

  private async findOrCreateUserFromChannel(
    channel: MessageChannel,
    channelUserId: string
  ): Promise<BotUser> {
    // Pour WhatsApp, channelUserId est le numéro de téléphone
    if (channel === 'whatsapp') {
      let botUser = await BotUser.findByPhone(channelUserId)

      if (!botUser) {
        // Créer utilisateur avec fullName null (sera complété pendant onboarding)
        botUser = await BotUser.create({
          phoneNumber: channelUserId,
          fullName: null,
          language: 'fr',
          registrationChannel: channel,
          isActive: true,
          isVerified: false,
        })
      }

      return botUser
    }

    throw new Error(`Unsupported channel: ${channel}`)
  }
}
