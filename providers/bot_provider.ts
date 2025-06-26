import type { ApplicationService } from '@adonisjs/core/types'

export default class BotProvider {
  constructor(protected app: ApplicationService) {}

  /**
   * Register bindings to the container
   */
  register() {
    // Pas de bindings container pour éviter les erreurs TypeScript
  }

  /**
   * The container bindings have booted
   */
  async boot() {
    // Initialisation différée
  }

  /**
   * The application has been booted
   */
  async start() {
    const botConfig = this.app.config.get('bot') as any

    // Start bot only if enabled
    if (!botConfig?.enabled) {
      console.log('🤖 Bot is disabled in configuration')
      return
    }

    // Start WhatsApp adapter if enabled
    if (botConfig?.channels?.whatsapp?.enabled) {
      const { default: BotEngine } = await import('#bot/core/bot_engine')
      const { default: WhatsAppAdapter } = await import('#bot/core/adapters/whatsapp_adapter')

      const botEngine = new BotEngine()
      await botEngine.initialize()

      const whatsappAdapter = new WhatsAppAdapter(
        botConfig.channels.whatsapp.sessionPath,
        botConfig.channels.whatsapp.maxReconnectAttempts,
        botConfig.channels.whatsapp.reconnectDelayMs
      )

      // Setup callbacks
      whatsappAdapter.setCallbacks({
        onMessageReceived: async (message: any) => {
          try {
            const response = await botEngine.processMessage(message)
            await whatsappAdapter.sendMessage(response)
          } catch (error) {
            console.error('❌ Error processing WhatsApp message:', error)
          }
        },
        onQRGenerated: (qr: string) => {
          console.log('📱 QR Code generated for WhatsApp')
          console.log(qr)
        },
        onConnectionUpdate: (status: string) => {
          console.log(`📱 WhatsApp status: ${status}`)
        },
      })

      // Start the adapter
      await whatsappAdapter.start()
      console.log('🤖 Bot started successfully')
    }
  }

  /**
   * Preparing to shutdown the app
   */
  async shutdown() {
    console.log('🤖 Bot shutdown')
  }
}
