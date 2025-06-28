import type { ApplicationService } from '@adonisjs/core/types'

export default class BotProvider {
  private botEngine: any = null
  private isInitialized: boolean = false
  private initializationPromise: Promise<void> | null = null

  constructor(protected app: ApplicationService) {}

  register() {
    console.log('🔧 BotProvider.register() called')
  }

  async boot() {
    console.log('🔧 BotProvider.boot() called')
  }

  async start() {
    console.log('🔧 BotProvider.start() called')
    console.log('🔧 DEBUG: Environment:', this.app.getEnvironment())
    console.log('🔧 DEBUG: process.argv:', process.argv)
    console.log('🔧 DEBUG: NODE_ENV:', process.env.NODE_ENV)

    // Dans start(), on ne fait qu'initialiser pour l'environnement web
    if (this.app.getEnvironment() !== 'web') {
      console.log('❌ Not in web environment, skipping bot initialization')
      return
    }

    console.log('✅ Web environment detected, proceeding with bot initialization')
    await this.initializeBot()
  }

  async ready() {
    console.log('🔧 BotProvider.ready() called')
    console.log('🔧 DEBUG: Environment in ready:', this.app.getEnvironment())

    // Ready est appelé après que le serveur HTTP soit prêt
    if (this.app.getEnvironment() === 'web' && !this.isInitialized) {
      console.log('🔄 Bot not initialized in start(), initializing in ready()')
      await this.initializeBot()
    }
  }

  private async initializeBot(): Promise<void> {
    // Éviter les initialisations multiples
    if (this.isInitialized || this.initializationPromise) {
      console.log('⚠️ Bot already initialized or initializing...')
      return this.initializationPromise || Promise.resolve()
    }

    console.log('🚀 Starting bot initialization...')

    this.initializationPromise = this._doInitialization()

    try {
      await this.initializationPromise
      this.isInitialized = true
      console.log('✅ Bot initialization completed successfully')
    } catch (error) {
      console.error('❌ Bot initialization failed:', error)
      this.initializationPromise = null
      throw error
    }
  }

  private async _doInitialization(): Promise<void> {
    try {
      // 1. Vérifier la configuration
      const botConfig = this.app.config.get('bot') as any
      console.log('📋 Bot config loaded:', {
        enabled: botConfig?.enabled,
        whatsappEnabled: botConfig?.channels?.whatsapp?.enabled,
        sessionPath: botConfig?.channels?.whatsapp?.sessionPath,
      })

      if (!botConfig?.enabled) {
        console.log('🤖 Bot is disabled in configuration')
        return
      }

      if (!botConfig?.channels?.whatsapp?.enabled) {
        console.log('📱 WhatsApp adapter is disabled')
        return
      }

      // 2. Initialiser l'EventBus en premier
      console.log('🔧 Importing EventBus...')
      const { botEventBus } = await import('#bot/core/event_bus')
      console.log('✅ EventBus imported successfully')

      // 3. Initialiser le BotEngine
      console.log('🔧 Importing BotEngine...')
      const { default: BotEngine } = await import('#bot/core/bot_engine')
      console.log('✅ BotEngine imported successfully')

      console.log('🔧 Creating BotEngine instance...')
      this.botEngine = new BotEngine()

      console.log('🔧 Initializing BotEngine...')
      await this.botEngine.initialize()
      console.log('✅ BotEngine initialized successfully')

      // 4. Configurer les événements de restart
      botEventBus.on('bot:restart_whatsapp', async () => {
        console.log('🔄 Restarting WhatsApp adapter via EventBus...')
        try {
          if (this.botEngine && typeof this.botEngine.restartWhatsApp === 'function') {
            await this.botEngine.restartWhatsApp()
            console.log('✅ WhatsApp adapter restarted successfully')
          } else {
            console.warn('⚠️ restartWhatsApp method not available on BotEngine')
          }
        } catch (error) {
          console.error('❌ Failed to restart WhatsApp adapter:', error)
          botEventBus.emitConnectionStatus('failed')
        }
      })

      console.log('🎉 Bot started successfully with SSE and EventBus')
    } catch (error) {
      console.error('❌ Critical error during bot initialization:')
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)

      // Réinitialiser l'état en cas d'erreur
      this.botEngine = null
      this.isInitialized = false

      throw error
    }
  }

  async shutdown(): Promise<void> {
    console.log('🔄 BotProvider shutdown initiated...')

    if (this.botEngine) {
      try {
        if (typeof this.botEngine.shutdown === 'function') {
          console.log('🔧 Shutting down BotEngine...')
          await this.botEngine.shutdown()
        }

        this.botEngine = null
        this.isInitialized = false
        console.log('✅ BotEngine shutdown completed')
      } catch (error) {
        console.error('❌ Error during BotEngine shutdown:', error)
      }
    }

    console.log('🤖 BotProvider shutdown completed')
  }

  // Méthodes utilitaires pour debugging et monitoring
  public getBotStatus(): {
    isInitialized: boolean
    hasEngine: boolean
    engineConnected: boolean | null
  } {
    return {
      isInitialized: this.isInitialized,
      hasEngine: !!this.botEngine,
      engineConnected:
        this.botEngine && typeof this.botEngine.isConnected === 'function'
          ? this.botEngine.isConnected()
          : null,
    }
  }

  // Méthode pour forcer la réinitialisation (utile pour debugging)
  public async forceRestart(): Promise<void> {
    console.log('🔄 Force restart requested...')

    if (this.isInitialized) {
      await this.shutdown()
    }

    this.initializationPromise = null
    await this.initializeBot()
  }
}
