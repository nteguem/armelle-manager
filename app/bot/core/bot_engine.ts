import { DateTime } from 'luxon'
import BotMessage from '#models/bot_message'
import BotSession from '#models/bot_session'
import BotUser from '#models/bot_user'
import I18nManager from './i18n_manager.js'
import MessageBuilder from './message_builder.js'
import ContextManager from './context_manager.js'
import SystemCommandHandler from './commands/system_command_handler.js'
import WorkflowEngine from '../workflows/workflow_engine.js'
import WhatsAppAdapter from './adapters/whatsapp_adapter.js'
import {
  OnboardingWorkflow,
  OnboardingActions,
} from '../workflows/definitions/onboarding_workflow.js'
import type { IncomingMessage, OutgoingMessage } from '#bot/types/bot_types'

export default class BotEngine {
  private readonly i18n: I18nManager
  private readonly messageBuilder: MessageBuilder
  private readonly contextManager: ContextManager
  private readonly systemCommandHandler: SystemCommandHandler
  private readonly workflowEngine: WorkflowEngine
  private readonly whatsappAdapter: WhatsAppAdapter

  constructor() {
    this.i18n = I18nManager.getInstance()
    this.messageBuilder = new MessageBuilder()
    this.contextManager = new ContextManager()
    this.systemCommandHandler = new SystemCommandHandler()
    this.workflowEngine = new WorkflowEngine()
    this.whatsappAdapter = new WhatsAppAdapter()
  }

  public async initialize(): Promise<void> {
    await this.i18n.initialize()
    this.workflowEngine.registerWorkflow(OnboardingWorkflow, OnboardingActions)
    this.setupWhatsAppAdapter()
    await this.whatsappAdapter.start()
    console.log('🤖 Bot Engine initialized')
  }

  private setupWhatsAppAdapter(): void {
    this.whatsappAdapter.setCallbacks({
      onMessageReceived: async (message: IncomingMessage) => {
        try {
          const response = await this.processMessage(message)
          await this.whatsappAdapter.sendMessage(response)
        } catch (error) {
          console.error('❌ Error processing message:', error)
        }
      },
    })
  }

  public isConnected(): boolean {
    return this.whatsappAdapter.isConnected()
  }

  public async processMessage(message: IncomingMessage): Promise<OutgoingMessage> {
    const startTime = Date.now()

    try {
      const { session, isNew } = await this.contextManager.getOrCreateSession(
        message.channel,
        message.channelUserId
      )

      await this.saveIncomingMessage(message, session)
      const response = await this.generateResponse(message, session, isNew)
      await this.saveOutgoingMessage(response, session)

      const processingTime = Date.now() - startTime
      await this.markMessageAsProcessed(message, session, processingTime)

      console.log(`✅ Message processed in ${processingTime}ms`)
      return response
    } catch (error) {
      const processingTime = Date.now() - startTime
      console.error('❌ Error processing message:', error)

      try {
        const session = await BotSession.findActiveSession(message.channel, message.channelUserId)
        if (session) {
          await this.markMessageAsError(message, session, error as Error, processingTime)
        }
      } catch {
        // Ignorer erreur de logging
      }

      return this.createErrorResponse(message)
    }
  }

  private async generateResponse(
    message: IncomingMessage,
    session: BotSession,
    isNewSession: boolean
  ): Promise<OutgoingMessage> {
    const botUser = await session.related('botUser').query().firstOrFail()

    const systemResponse = await this.systemCommandHandler.handle(session, message.content)
    if (systemResponse) {
      return this.createOutgoingMessage(message, systemResponse, botUser.language)
    }

    if (!session.currentWorkflow) {
      if (!botUser.isVerified) {
        return await this.handleNewUser(message, session, botUser)
      }
      return await this.handleMainMenu(message, botUser)
    }

    return await this.handleWorkflowContinuation(message, session, botUser)
  }

  private async handleNewUser(
    message: IncomingMessage,
    session: BotSession,
    botUser: BotUser
  ): Promise<OutgoingMessage> {
    const result = await this.workflowEngine.startWorkflow(session.id, 'onboarding')
    return this.createOutgoingMessage(message, result.response, botUser.language)
  }

  private async handleMainMenu(
    message: IncomingMessage,
    botUser: BotUser
  ): Promise<OutgoingMessage> {
    const responseText = this.messageBuilder.buildMenu('common.main_menu', botUser.language, {
      userName: botUser.fullName,
    })

    return this.createOutgoingMessage(message, responseText, botUser.language)
  }

  private async handleWorkflowContinuation(
    message: IncomingMessage,
    session: BotSession,
    botUser: BotUser
  ): Promise<OutgoingMessage> {
    try {
      const result = await this.workflowEngine.processInput(session.id, message.content)

      if (result.completed) {
        const menuResponse = await this.handleMainMenu(message, botUser)
        return menuResponse
      }

      return this.createOutgoingMessage(message, result.response, botUser.language)
    } catch (error) {
      console.error('Workflow error:', error)
      await this.contextManager.abandonWorkflow(session.id)
      const errorText = this.messageBuilder.buildError('errors.generic_error', botUser.language)
      return this.createOutgoingMessage(message, errorText, botUser.language)
    }
  }

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

  private createErrorResponse(message: IncomingMessage): OutgoingMessage {
    const errorText = this.messageBuilder.buildError('errors.generic_error', 'fr')
    return this.createOutgoingMessage(message, errorText, 'fr')
  }

  public async shutdown(): Promise<void> {
    try {
      await this.whatsappAdapter.stop()
      console.log('🤖 Bot shutdown completed')
    } catch (error) {
      console.error('❌ Error during shutdown:', error)
    }
  }

  public async cleanup(): Promise<{ expiredSessions: number }> {
    const expiredSessions = await this.contextManager.cleanupExpiredSessions()
    console.log(`🧹 Cleanup: ${expiredSessions} expired sessions`)
    return { expiredSessions }
  }
}
