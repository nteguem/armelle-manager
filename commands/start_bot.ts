import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import BotService from '#services/bot_service'

export default class StartBot extends BaseCommand {
  static commandName = 'bot:start'
  static description = 'Démarre le bot Armelle (Assistant fiscal du Cameroun)'

  static options: CommandOptions = {
    startApp: true, // Démarre l'app AdonisJS (pour DB, etc.)
  }

  async run() {
    this.logger.info('🚀 Démarrage du bot Armelle...')

    const bot = new BotService()

    try {
      // Démarrer le bot
      await bot.start()

      // Message de confirmation
      this.logger.success('✅ Bot Armelle démarré avec succès!')
      this.logger.info('📱 Scannez le QR code WhatsApp pour connecter')
      this.logger.info('🛑 Appuyez sur Ctrl+C pour arrêter')

      // Gestionnaire d'arrêt propre
      process.on('SIGINT', async () => {
        this.logger.info('\n🛑 Arrêt du bot en cours...')

        try {
          await bot.stop()
          this.logger.success('✅ Bot arrêté proprement')
          process.exit(0)
        } catch (error) {
          this.logger.error("❌ Erreur lors de l'arrêt")
          console.error(error)
          process.exit(1)
        }
      })

      // Gestionnaire d'erreurs non gérées
      process.on('uncaughtException', async (error) => {
        this.logger.error('❌ Erreur critique')
        console.error(error)
        await bot.stop()
        process.exit(1)
      })

      process.on('unhandledRejection', async (reason) => {
        this.logger.error('❌ Promesse rejetée')
        console.error(reason)
        await bot.stop()
        process.exit(1)
      })

      // Garder le processus vivant
      await this.keepAlive()
    } catch (error) {
      this.logger.error('❌ Échec du démarrage du bot')
      console.error(error)
      this.exitCode = 1
    }
  }

  /**
   * Garde le processus vivant
   */
  private async keepAlive(): Promise<void> {
    return new Promise(() => {
      // Processus reste vivant jusqu'à SIGINT
    })
  }
}
