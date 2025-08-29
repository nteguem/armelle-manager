import MessageDispatcher from '#bot/core/handlers/message_dispatcher'
import CommandManager from '#bot/core/managers/command_manager'
import SessionManager from '#bot/core/managers/session_manager'
import I18nManager from '#bot/core/managers/i18n_manager'
import WhatsAppAdapter from '#bot/core/adapters/whatsapp_adapter'
import botConfig from '#config/bot'
import type { ChannelAdapter, IncomingMessage } from '#bot/types/bot_types'
import WorkflowManager from '#bot/core/workflow/workflow_manager'

export default class BotService {
  private messageDispatcher: MessageDispatcher
  private adapters: Map<string, ChannelAdapter> = new Map()
  private isStarted: boolean = false

  constructor() {
    this.messageDispatcher = new MessageDispatcher()
  }

  /**
   * Initialise et démarre le bot
   */
  public async start(): Promise<void> {
    if (this.isStarted) {
      console.log('🤖 Bot is already started')
      return
    }

    try {
      console.log('🚀 Starting Armelle Bot...')

      // 1. Initialiser les managers
      await this.initializeManagers()

      // 2. Configurer les adaptateurs
      await this.setupAdapters()

      // 3. Démarrer les adaptateurs activés
      await this.startAdapters()

      // 4. Configurer le nettoyage automatique
      this.setupCleanupTasks()

      this.isStarted = true
      console.log('✅ Armelle Bot started successfully!')
    } catch (error) {
      console.error('❌ Failed to start bot:', error)
      throw error
    }
  }

  /**
   * Arrête le bot proprement
   */
  public async stop(): Promise<void> {
    if (!this.isStarted) {
      console.log('🤖 Bot is not running')
      return
    }

    try {
      console.log('🛑 Stopping Armelle Bot...')

      // Arrêter tous les adaptateurs
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

  /**
   * Vérifie si le bot est démarré
   */
  public isRunning(): boolean {
    return this.isStarted
  }

  /**
   * Traite un message entrant (pour tests ou API)
   */
  public async processMessage(message: IncomingMessage): Promise<void> {
    if (!this.isStarted) {
      throw new Error('Bot must be started before processing messages')
    }

    await this.messageDispatcher.handleIncomingMessage(message)
  }

  /**
   * Initialise tous les managers singleton
   */
  private async initializeManagers(): Promise<void> {
    console.log('⚙️ Initializing managers...')

    // I18nManager - doit être initialisé en premier
    const i18nManager = I18nManager.getInstance()
    await i18nManager.initialize()

    // CommandManager - maintenant avec initialisation asynchrone
    const commandManager = CommandManager.getInstance()
    await commandManager.initialize()

    // Pas besoin d'initialisation asynchrone
    const workflowManager = WorkflowManager.getInstance()
    await workflowManager.initialize()
    // SessionManager
    const sessionManager = SessionManager.getInstance()
    console.log('✅ All managers initialized')
  }

  /**
   * Configure les adaptateurs selon la configuration
   */
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

    // Enregistrer les adaptateurs dans le dispatcher
    for (const [channel, adapter] of this.adapters) {
      this.messageDispatcher.registerAdapter(channel, adapter)
    }

    console.log(`✅ ${this.adapters.size} adapter(s) configured`)
  }

  /**
   * Démarre tous les adaptateurs configurés
   */
  private async startAdapters(): Promise<void> {
    console.log('🚀 Starting channel adapters...')

    for (const [channel, adapter] of this.adapters) {
      try {
        // Configurer les callbacks
        adapter.setCallbacks({
          onMessageReceived: this.handleIncomingMessage.bind(this),
        })

        // Démarrer l'adaptateur
        await adapter.start()
        console.log(`✅ ${channel} adapter started`)
      } catch (error) {
        console.error(`❌ Failed to start ${channel} adapter:`, error)
        // Continue avec les autres adaptateurs
      }
    }
  }

  /**
   * Gestionnaire pour les messages entrants des adaptateurs
   */
  private async handleIncomingMessage(message: IncomingMessage): Promise<void> {
    try {
      await this.messageDispatcher.handleIncomingMessage(message)
    } catch (error) {
      console.error('❌ Error handling incoming message:', error)
    }
  }

  /**
   * Configure les tâches de nettoyage automatique
   */
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
