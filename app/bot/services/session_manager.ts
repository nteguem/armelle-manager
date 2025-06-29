import type { IncomingMessage, BotSessionExtended } from '#bot/types/bot_types'
import BotUser from '#models/bot_user'
import BotSession from '#models/bot_session'
import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'

export default class SessionManager {
  async getOrCreate(message: IncomingMessage): Promise<BotSessionExtended> {
    try {
      let session = await BotSession.query()
        .where('channel', message.channel)
        .where('channelUserId', message.channelUserId)
        .where('isActive', true)
        .preload('botUser')
        .first()

      if (!session) {
        let user = await BotUser.query().where('phoneNumber', message.channelUserId).first()

        if (!user) {
          user = await BotUser.create({
            phoneNumber: message.channelUserId,
            language: 'fr',
            isActive: true,
            isVerified: false,
            registrationChannel: message.channel,
            metadata: {},
          })
        }

        session = await BotSession.create({
          botUserId: user.id,
          channel: message.channel,
          channelUserId: message.channelUserId,
          currentContext: {},
          persistentContext: {},
          navigationStack: [],
          workflowHistory: {},
          activeWorkflows: [],
          isActive: true,
          messageCount: 0,
          workflowCount: 0,
          tempData: {},
        })

        await session.load('botUser')
      }

      // 🆕 FORCER LES TYPES CORRECTS
      if (!Array.isArray(session.navigationStack)) {
        session.navigationStack = []
      }
      if (!Array.isArray(session.activeWorkflows)) {
        session.activeWorkflows = []
      }
      if (typeof session.currentContext !== 'object' || session.currentContext === null) {
        session.currentContext = {}
      }
      if (typeof session.persistentContext !== 'object' || session.persistentContext === null) {
        session.persistentContext = {}
      }
      if (typeof session.workflowHistory !== 'object' || session.workflowHistory === null) {
        session.workflowHistory = {}
      }
      if (typeof session.tempData !== 'object' || session.tempData === null) {
        session.tempData = {}
      }

      session.lastInteractionAt = DateTime.now()
      session.messageCount++
      await session.save()

      const extendedSession = session as BotSessionExtended
      extendedSession.currentSubflow = session.currentContext?.currentSubflow || null
      extendedSession.subflowPosition = session.currentContext?.subflowPosition || 0

      return extendedSession
    } catch (error) {
      logger.error({ error: error.message }, 'Error in getOrCreate')
      throw error
    }
  }

  async clearWorkflow(session: BotSessionExtended): Promise<void> {
    session.currentWorkflow = null
    session.currentStep = null
    session.currentSubflow = null
    session.subflowPosition = 0
    session.currentContext = {}

    // 🆕 S'assurer que c'est un Array
    if (!Array.isArray(session.navigationStack)) {
      session.navigationStack = []
    } else {
      session.navigationStack = []
    }

    await session.save()
  }

  async updateSubflowPosition(
    session: BotSessionExtended,
    subflowId: string,
    position: number
  ): Promise<void> {
    session.currentSubflow = subflowId
    session.subflowPosition = position
    session.currentContext = {
      ...session.currentContext,
      currentSubflow: subflowId,
      subflowPosition: position,
    }
    await session.save()
  }

  async pushNavigationState(session: BotSessionExtended): Promise<void> {
    // 🆕 S'assurer que navigationStack est un Array
    if (!Array.isArray(session.navigationStack)) {
      session.navigationStack = []
    }

    session.navigationStack.push({
      workflow: session.currentWorkflow,
      step: session.currentStep,
      subflow: session.currentSubflow || null,
      subflowPosition: session.subflowPosition || 0,
      context: { ...session.currentContext },
      timestamp: new Date().toISOString(),
    })

    if (session.navigationStack.length > 50) {
      session.navigationStack = session.navigationStack.slice(-50)
    }

    await session.save()
  }

  async popNavigationState(session: BotSessionExtended): Promise<boolean> {
    // 🆕 S'assurer que navigationStack est un Array
    if (!Array.isArray(session.navigationStack)) {
      session.navigationStack = []
      return false
    }

    const previous = session.navigationStack.pop()
    if (!previous) return false

    session.currentWorkflow = previous.workflow
    session.currentStep = previous.step
    session.currentSubflow = (previous as any).subflow || null
    session.subflowPosition = (previous as any).subflowPosition || 0
    session.currentContext = previous.context
    await session.save()

    return true
  }

  async startWorkflow(
    session: BotSessionExtended,
    workflowId: string,
    initialStep: string
  ): Promise<void> {
    // Sauvegarder l'état actuel pour navigation
    if (session.currentWorkflow) {
      await this.pushNavigationState(session)
    }

    session.currentWorkflow = workflowId
    session.currentStep = initialStep
    session.workflowCount++

    // Mettre à jour l'historique des workflows
    const now = DateTime.now().toISO()
    if (typeof session.workflowHistory !== 'object' || session.workflowHistory === null) {
      session.workflowHistory = {}
    }

    session.workflowHistory = {
      ...session.workflowHistory,
      [workflowId]: {
        startedAt: now,
        steps: [initialStep],
      },
    }

    // Ajouter aux workflows actifs
    if (!Array.isArray(session.activeWorkflows)) {
      session.activeWorkflows = []
    }
    if (!session.activeWorkflows.includes(workflowId)) {
      session.activeWorkflows.push(workflowId)
    }

    await session.save()
  }

  async updateWorkflowStep(session: BotSessionExtended, stepId: string): Promise<void> {
    session.currentStep = stepId

    // Mettre à jour l'historique des étapes
    if (
      session.currentWorkflow &&
      typeof session.workflowHistory === 'object' &&
      session.workflowHistory !== null &&
      session.workflowHistory[session.currentWorkflow]
    ) {
      session.workflowHistory[session.currentWorkflow].steps.push(stepId)
    }

    await session.save()
  }

  async endWorkflow(session: BotSessionExtended, outcome?: string): Promise<void> {
    if (session.currentWorkflow) {
      // Mettre à jour l'historique
      if (
        typeof session.workflowHistory === 'object' &&
        session.workflowHistory !== null &&
        session.workflowHistory[session.currentWorkflow]
      ) {
        session.workflowHistory[session.currentWorkflow].completedAt = DateTime.now().toISO()
        if (outcome) {
          session.workflowHistory[session.currentWorkflow].outcome = outcome
        }
      }

      // Retirer des workflows actifs
      if (Array.isArray(session.activeWorkflows)) {
        session.activeWorkflows = session.activeWorkflows.filter(
          (w) => w !== session.currentWorkflow
        )
      }
    }

    // Nettoyer l'état actuel
    await this.clearWorkflow(session)
  }

  async cleanupExpiredSessions(hoursOld: number = 24): Promise<number> {
    try {
      const cutoffDate = DateTime.now().minus({ hours: hoursOld }).toSQL()

      const expiredSessions = await BotSession.query()
        .where('lastInteractionAt', '<', cutoffDate)
        .where('isActive', true)

      let cleanedCount = 0
      for (const session of expiredSessions) {
        session.isActive = false
        await session.save()
        cleanedCount++
      }

      if (cleanedCount > 0) {
        logger.info({ cleanedCount, hoursOld }, 'Expired sessions cleaned up')
      }

      return cleanedCount
    } catch (error) {
      logger.error({ error: error.message }, 'Error cleaning up expired sessions')
      return 0
    }
  }

  async getUserStats(userId: string): Promise<{
    totalSessions: number
    activeSessions: number
    totalMessages: number
    totalWorkflows: number
    lastInteraction: string | null
  }> {
    try {
      const sessions = await BotSession.query().where('botUserId', userId)

      const activeSessions = sessions.filter((s) => s.isActive)
      const totalMessages = sessions.reduce((sum, s) => sum + s.messageCount, 0)
      const totalWorkflows = sessions.reduce((sum, s) => sum + s.workflowCount, 0)

      const lastInteraction = sessions
        .map((s) => s.lastInteractionAt)
        .filter((d) => d !== null)
        .sort((a, b) => b!.toMillis() - a!.toMillis())[0]

      return {
        totalSessions: sessions.length,
        activeSessions: activeSessions.length,
        totalMessages,
        totalWorkflows,
        lastInteraction: lastInteraction?.toFormat('dd/MM/yyyy HH:mm') || null,
      }
    } catch (error) {
      logger.error({ error: error.message, userId }, 'Error getting user stats')
      throw error
    }
  }
}
