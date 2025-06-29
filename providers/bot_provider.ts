import type { ApplicationService } from '@adonisjs/core/types'

export default class BotProvider {
  private botEngine: any = null
  private isInitialized: boolean = false
  private initializationPromise: Promise<void> | null = null

  constructor(protected app: ApplicationService) {}

  register() {
    console.log('BotProvider registered')
  }

  async boot() {
    console.log('BotProvider booting')
  }

  async start() {
    console.log('BotProvider.start() called')
    console.warn({ environment: this.app.getEnvironment() }, 'Environment check')

    if (this.app.getEnvironment() !== 'web') {
      console.log('Not in web environment, skipping bot initialization')
      return
    }

    console.log('Web environment detected, proceeding with bot initialization')
    await this.initializeBot()
  }

  async ready() {
    console.log('BotProvider.ready() called')

    if (this.app.getEnvironment() === 'web' && !this.isInitialized) {
      console.log('Bot not initialized in start(), initializing in ready()')
      await this.initializeBot()
    }
  }

  private async initializeBot(): Promise<void> {
    if (this.isInitialized || this.initializationPromise) {
      console.warn('Bot already initialized or initializing...')
      return this.initializationPromise || Promise.resolve()
    }

    console.log('Starting bot initialization...')
    this.initializationPromise = this._doInitialization()

    try {
      await this.initializationPromise
      this.isInitialized = true
      console.log('Bot initialization completed successfully')
    } catch (error) {
      console.error({ error: error.message }, 'Bot initialization failed')
      this.initializationPromise = null
      throw error
    }
  }

  private async _doInitialization(): Promise<void> {
    try {
      const botConfig = this.app.config.get('bot') as any
      console.log(
        {
          enabled: botConfig.enabled,
          whatsappEnabled: botConfig.channels.whatsapp.enabled,
        },
        'Bot config loaded'
      )

      if (!botConfig.enabled) {
        console.log('Bot is disabled in configuration')
        return
      }

      if (!botConfig.channels.whatsapp.enabled) {
        console.log('WhatsApp adapter is disabled')
        return
      }

      console.log('Importing BotEngine...')
      const { default: BotEngine } = await import('#bot/core/bot_engine')
      console.log('BotEngine imported successfully')

      console.log('Creating BotEngine instance...')
      this.botEngine = new BotEngine()

      console.log('Initializing BotEngine...')
      await this.botEngine.initialize()
      console.log('BotEngine initialized successfully')

      console.log('Bot started successfully')
    } catch (error) {
      console.error(
        {
          error: error.message,
          stack: error.stack,
        },
        'Critical error during bot initialization'
      )

      this.botEngine = null
      this.isInitialized = false
      throw error
    }
  }

  async shutdown(): Promise<void> {
    console.log('BotProvider shutdown initiated')

    if (this.botEngine) {
      try {
        if (typeof this.botEngine.shutdown === 'function') {
          console.log('Shutting down BotEngine')
          await this.botEngine.shutdown()
        }

        this.botEngine = null
        this.isInitialized = false
        console.log('BotEngine shutdown completed')
      } catch (error) {
        console.error({ error: error.message }, 'Error during BotEngine shutdown')
      }
    }

    console.log('BotProvider shutdown completed')
  }

  public getBotStatus() {
    return {
      isInitialized: this.isInitialized,
      hasEngine: !!this.botEngine,
      engineConnected: this.botEngine?.isConnected?.() || false,
    }
  }

  public async forceRestart(): Promise<void> {
    console.log('Force restart requested')

    if (this.isInitialized) {
      await this.shutdown()
    }

    this.initializationPromise = null
    await this.initializeBot()
  }
}
