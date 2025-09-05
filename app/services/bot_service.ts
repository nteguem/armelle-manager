// app/services/bot_service.ts

import MessageRouter from '#bot/core/routing/message_router'
import CommandManager from '#bot/core/managers/command_manager'
import SessionManager from '#bot/core/managers/session_manager'
import I18nManager from '#bot/core/managers/i18n_manager'
import WhatsAppAdapter from '#bot/core/adapters/whatsapp_adapter'
import { WorkflowRegistry } from '#bot/core/workflow/registry/workflow_registry'
import { WorkflowServiceRegistry } from '#bot/core/workflow/services/workflow_service_registry'
import WorkflowEngine from '#bot/core/workflow/engine/workflow_engine'
import AIEngine from '#bot/core/ai/engine/ai_engine'
import DgiScraperService from '#services/dgi_scraper_service'
import TaxpayerService from '#services/taxpayer_service'
import BotUserService from '#services/bot_user_service'
import botConfig from '#config/bot'
import type { ChannelAdapter, IncomingMessage } from '#bot/types/bot_types'
import OnboardingService from './onboarding_service.js'

export default class BotService {
  private messageRouter: MessageRouter
  private adapters: Map<string, ChannelAdapter> = new Map()
  private isStarted: boolean = false

  constructor() {
    this.messageRouter = new MessageRouter()
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
      await this.initializeAISystem()
      await this.setupRouter()
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

    await this.messageRouter.handleIncomingMessage(message)
  }

  private async initializeManagers(): Promise<void> {
    console.log('⚙️ Initializing managers...')

    const i18nManager = I18nManager.getInstance()
    await i18nManager.initialize()

    const commandManager = CommandManager.getInstance()
    await commandManager.initialize()

    // SessionManager est un singleton, pas besoin d'initialisation
    const sessionManager = SessionManager.getInstance()

    console.log('✅ All managers initialized')
  }

  private async initializeWorkflowSystem(): Promise<void> {
    console.log('🔧 Initializing workflow system...')

    // Initialiser le service registry
    const serviceRegistry = WorkflowServiceRegistry.getInstance()

    // Enregistrer les services existants
    serviceRegistry.register('dgi_scraper', new DgiScraperService())
    serviceRegistry.register('taxpayer_service', new TaxpayerService())
    serviceRegistry.register('bot_user_service', new BotUserService())

    // Service d'onboarding
    serviceRegistry.register('onboarding_service', new OnboardingService())

    console.log('✅ Workflow services registered')

    // Initialiser le workflow registry
    const workflowRegistry = WorkflowRegistry.getInstance()

    // Enregistrer le workflow onboarding
    const { OnboardingWorkflow } = await import(
      '#bot/core/workflow/definitions/onboarding.workflow'
    )
    workflowRegistry.register(OnboardingWorkflow as any, {
      version: '1.0.0',
      description: "Processus d'inscription des nouveaux utilisateurs",
    })

    const stats = workflowRegistry.getStats()
    console.log(`✅ Workflow system initialized - ${stats.totalWorkflows} workflow(s) available`)
  }

  private async initializeAISystem(): Promise<void> {
    console.log('🤖 Initializing AI system...')

    try {
      const aiEngine = AIEngine.getInstance()

      // Initialiser avec le provider configuré
      const provider = process.env.AI_PROVIDER || 'anthropic'
      await aiEngine.initialize(provider)

      if (aiEngine.isAvailable()) {
        console.log(`✅ AI system initialized with ${provider} provider`)
      } else {
        console.warn('⚠️ AI system initialized but provider not available')
        console.warn('Check your API keys in .env file')
      }
    } catch (error) {
      console.error('❌ Failed to initialize AI system:', error)
      console.warn('Bot will run without AI capabilities')
    }
  }

  private async setupRouter(): Promise<void> {
    console.log('🔌 Setting up message router...')

    // Le router est déjà créé dans le constructeur
    // Juste pour le log

    console.log('✅ Message router configured')
  }

  private async setupAdapters(): Promise<void> {
    console.log('🔌 Setting up channel adapters...')

    const enabledChannels = botConfig.channels.enabled

    for (const channel of enabledChannels) {
      let adapter: ChannelAdapter | undefined

      switch (channel) {
        case 'whatsapp':
          if (botConfig.channels.whatsapp.enabled) {
            adapter = new WhatsAppAdapter()
            this.adapters.set(channel, adapter)
            // Enregistrer l'adapter dans le router
            this.messageRouter.registerAdapter(channel, adapter)
            console.log('📱 WhatsApp adapter configured')
          }
          break

        default:
          console.warn(`⚠️ Unknown channel: ${channel}`)
      }
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
      // Déléguer au router
      await this.messageRouter.handleIncomingMessage(message)
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

  public getSystemStats(): {
    isRunning: boolean
    adapters: number
    workflows: any
    engine: any
    ai: any
  } {
    const workflowRegistry = WorkflowRegistry.getInstance()
    const workflowEngine = WorkflowEngine.getInstance()
    const aiEngine = AIEngine.getInstance()

    return {
      isRunning: this.isStarted,
      adapters: this.adapters.size,
      workflows: workflowRegistry.getStats(),
      engine: workflowEngine.getStats(),
      ai: aiEngine.getStats(),
    }
  }
}
