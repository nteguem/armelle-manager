import MessageDispatcher from '#bot/core/handlers/message_dispatcher'
import CommandManager from '#bot/core/managers/command_manager'
import SessionManager from '#bot/core/managers/session_manager'
import I18nManager from '#bot/core/managers/i18n_manager'
import WhatsAppAdapter from '#bot/core/adapters/whatsapp_adapter'
import { WorkflowRegistry } from '#bot/core/workflow/registry/workflow_registry'
import { WorkflowServiceRegistry } from '#bot/core/workflow/services/workflow_service_registry'
import {
  OnboardingWorkflow,
  OnboardingProgressConfig,
} from '#bot/core/workflow/definitions/onboarding.workflow'
import DgiScraperService from '#services/dgi_scraper_service'
import TaxpayerService from '#services/taxpayer_service'
import BotUserService from '#services/bot_user_service'
import botConfig from '#config/bot'
import type { ChannelAdapter, IncomingMessage } from '#bot/types/bot_types'
import OnboardingService from './onboarding_service.js'

export default class BotService {
  private messageDispatcher: MessageDispatcher
  private adapters: Map<string, ChannelAdapter> = new Map()
  private isStarted: boolean = false

  constructor() {
    this.messageDispatcher = new MessageDispatcher()
  }

  public async start(): Promise<void> {
    if (this.isStarted) {
      console.log('🤖 Bot is already started')
      return
    }

    try {
      console.log('🚀 Starting Armelle Bot...')

      await this.initializeManagers()
      await this.initializeWorkflowSystem()
      await this.setupAdapters()
      await this.startAdapters()
      this.setupCleanupTasks()

      this.isStarted = true
      console.log('✅ Armelle Bot started successfully!')
    } catch (error) {
      console.error('❌ Failed to start bot:', error)
      throw error
    }
  }

  public async stop(): Promise<void> {
    if (!this.isStarted) {
      console.log('🤖 Bot is not running')
      return
    }

    try {
      console.log('🛑 Stopping Armelle Bot...')

      for (const [channel, adapter] of this.adapters) {
        console.log(`📱 Stopping ${channel} adapter...`)
        await adapter.stop()
      }

      this.isStarted = false
      console.log('✅ Armelle Bot stopped successfully!')
    } catch (error) {
      console.error('❌ Error stopping bot:', error)
      throw error
    }
  }

  public isRunning(): boolean {
    return this.isStarted
  }

  public async processMessage(message: IncomingMessage): Promise<void> {
    if (!this.isStarted) {
      throw new Error('Bot must be started before processing messages')
    }

    await this.messageDispatcher.handleIncomingMessage(message)
  }

  private async initializeManagers(): Promise<void> {
    console.log('⚙️ Initializing managers...')

    const i18nManager = I18nManager.getInstance()
    await i18nManager.initialize()

    const commandManager = CommandManager.getInstance()
    await commandManager.initialize()

    const sessionManager = SessionManager.getInstance()

    console.log('✅ All managers initialized')
  }

  private async initializeWorkflowSystem(): Promise<void> {
    console.log('🔧 Initializing workflow system...')

    const serviceRegistry = WorkflowServiceRegistry.getInstance()

    serviceRegistry.register('dgi_scraper', new DgiScraperService())
    serviceRegistry.register('taxpayer_service', new TaxpayerService())
    serviceRegistry.register('bot_user_service', new BotUserService())

    serviceRegistry.register('onboarding_service', new OnboardingService())

    console.log('✅ Workflow services registered')

    const workflowRegistry = WorkflowRegistry.getInstance()

    workflowRegistry.register(OnboardingWorkflow, {
      version: '2.0.0',
      description: "Processus d'inscription simplifié avec service centralisé",
      progressConfig: OnboardingProgressConfig,
    })

    console.log('✅ Workflows registered')

    const stats = workflowRegistry.getStats()
    console.log(`✅ Workflow system initialized - ${stats.totalWorkflows} workflow(s) available`)
  }

  private async setupAdapters(): Promise<void> {
    console.log('🔌 Setting up channel adapters...')

    const enabledChannels = botConfig.channels.enabled

    for (const channel of enabledChannels) {
      let adapter: ChannelAdapter

      switch (channel) {
        case 'whatsapp':
          if (botConfig.channels.whatsapp.enabled) {
            adapter = new WhatsAppAdapter()
            this.adapters.set(channel, adapter)
            console.log('📱 WhatsApp adapter configured')
          }
          break

        default:
          console.warn(`⚠️ Unknown channel: ${channel}`)
      }
    }

    for (const [channel, adapter] of this.adapters) {
      this.messageDispatcher.registerAdapter(channel, adapter)
    }

    console.log(`✅ ${this.adapters.size} adapter(s) configured`)
  }

  private async startAdapters(): Promise<void> {
    console.log('🚀 Starting channel adapters...')

    for (const [channel, adapter] of this.adapters) {
      try {
        adapter.setCallbacks({
          onMessageReceived: this.handleIncomingMessage.bind(this),
        })

        await adapter.start()
        console.log(`✅ ${channel} adapter started`)
      } catch (error) {
        console.error(`❌ Failed to start ${channel} adapter:`, error)
      }
    }
  }

  private async handleIncomingMessage(message: IncomingMessage): Promise<void> {
    try {
      await this.messageDispatcher.handleIncomingMessage(message)
    } catch (error) {
      console.error('❌ Error handling incoming message:', error)
    }
  }

  private setupCleanupTasks(): void {
    const cleanupInterval = botConfig.sessions.cleanupIntervalHours * 60 * 60 * 1000

    setInterval(() => {
      try {
        const sessionManager = SessionManager.getInstance()
        sessionManager.cleanupExpiredSessions()
        console.log('🧹 Session cleanup completed')
      } catch (error) {
        console.error('❌ Session cleanup error:', error)
      }
    }, cleanupInterval)

    console.log(`🧹 Cleanup tasks scheduled every ${botConfig.sessions.cleanupIntervalHours}h`)
  }
}
