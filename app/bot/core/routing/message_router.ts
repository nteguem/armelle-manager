import type {
  IncomingMessage,
  OutgoingMessage,
  SessionContext,
  ChannelAdapter,
} from '#bot/types/bot_types'
import SessionManager from '#bot/core/managers/session_manager'
import CommandHandler from './command_handler.js'
import WorkflowOrchestrator from './workflow_orchestrator.js'
import MenuNavigationHandler from './menu_navigation_handler.js'
import BotMessage from '#models/bot/bot_message'

export default class MessageRouter {
  private sessionManager: SessionManager
  private commandHandler: CommandHandler
  private workflowOrchestrator: WorkflowOrchestrator
  private menuNavigationHandler: MenuNavigationHandler
  private adapters: Map<string, ChannelAdapter> = new Map()

  constructor() {
    this.sessionManager = SessionManager.getInstance()
    this.commandHandler = new CommandHandler()
    this.workflowOrchestrator = new WorkflowOrchestrator()
    this.menuNavigationHandler = new MenuNavigationHandler()
    this.injectSendMessage()
  }

  private injectSendMessage(): void {
    const sendMessageBound = this.sendMessage.bind(this)

    // Injection dans les handlers principaux
    ;(this.commandHandler as any).sendMessage = sendMessageBound
    ;(this.workflowOrchestrator as any).sendMessage = sendMessageBound
    ;(this.menuNavigationHandler as any).sendMessage = sendMessageBound

    // Injection dans StepResultHandler
    const stepResultHandler = (this.workflowOrchestrator as any).stepResultHandler
    if (stepResultHandler) {
      ;(stepResultHandler as any).sendMessage = sendMessageBound

      // Injection dans ServiceResultHandler via StepResultHandler
      const serviceResultHandler = (stepResultHandler as any).serviceResultHandler
      if (serviceResultHandler) {
        ;(serviceResultHandler as any).sendMessage = sendMessageBound
      }
    }

    // Injection directe dans ServiceResultHandler du WorkflowOrchestrator (au cas où)
    const directServiceHandler = (this.workflowOrchestrator as any).serviceResultHandler
    if (directServiceHandler) {
      ;(directServiceHandler as any).sendMessage = sendMessageBound
    }
  }

  public registerAdapter(channel: string, adapter: ChannelAdapter): void {
    this.adapters.set(channel, adapter)
  }

  public async handleIncomingMessage(incomingMessage: IncomingMessage): Promise<void> {
    const startTime = Date.now()
    let botMessage: BotMessage | null = null

    try {
      const sessionContext = await this.sessionManager.getOrCreateSession(
        incomingMessage.channel,
        incomingMessage.channelUserId
      )

      botMessage = await this.createBotMessage(sessionContext, incomingMessage)
      await this.routeMessage(sessionContext, incomingMessage.content, botMessage)
    } catch (error) {
      console.error('Router error:', error)
      await this.handleError(incomingMessage, error as Error, botMessage)
    } finally {
      if (botMessage) {
        const duration = Date.now() - startTime
        await botMessage.markAsProcessed(duration)
      }
    }
  }

  private async routeMessage(
    sessionContext: SessionContext,
    content: string,
    botMessage: BotMessage
  ): Promise<void> {
    if (await this.commandHandler.canHandle(content, sessionContext)) {
      await this.commandHandler.handle(content, sessionContext, botMessage)
      return
    }

    if (sessionContext.currentWorkflow) {
      await this.workflowOrchestrator.handleWorkflowMessage(sessionContext, content)
      return
    }

    const botUser = await this.getBotUser(sessionContext.userId)
    if (!botUser?.fullName) {
      await this.workflowOrchestrator.startOnboarding(sessionContext)
      return
    }

    await this.menuNavigationHandler.handle(sessionContext, content)
  }

  public async sendMessage(sessionContext: SessionContext, content: string): Promise<void> {
    const adapter = this.adapters.get(sessionContext.channel)
    if (!adapter) {
      throw new Error(`No adapter for channel: ${sessionContext.channel}`)
    }

    const outgoingMessage: OutgoingMessage = {
      channel: sessionContext.channel,
      to: sessionContext.channelUserId,
      content,
      messageType: 'text',
    }

    await adapter.sendMessage(outgoingMessage)
    await this.createOutgoingBotMessage(sessionContext, content)
  }

  private async createBotMessage(
    sessionContext: SessionContext,
    incomingMessage: IncomingMessage
  ): Promise<BotMessage> {
    const botSession = await this.getBotSession(sessionContext)
    return await BotMessage.createIncoming({
      session: botSession,
      content: incomingMessage.content,
      messageType: incomingMessage.messageType,
      rawData: incomingMessage.rawData,
    })
  }

  private async createOutgoingBotMessage(
    sessionContext: SessionContext,
    content: string
  ): Promise<void> {
    const botSession = await this.getBotSession(sessionContext)
    await BotMessage.createOutgoing({
      session: botSession,
      content,
      messageType: 'text',
    })
  }

  private async getBotSession(sessionContext: SessionContext): Promise<any> {
    const botSessionModule = await import('#models/bot/bot_session')
    return await botSessionModule.default.findActiveSession(
      sessionContext.channel,
      sessionContext.channelUserId
    )
  }

  private async getBotUser(userId: string): Promise<any> {
    const botUserModule = await import('#models/bot/bot_user')
    return await botUserModule.default.find(userId)
  }

  private async handleError(
    incomingMessage: IncomingMessage,
    error: Error,
    botMessage: BotMessage | null
  ): Promise<void> {
    console.error('MessageRouter Error:', error.message)
    if (botMessage) {
      await botMessage.markAsError(error.message)
    }
  }
}
