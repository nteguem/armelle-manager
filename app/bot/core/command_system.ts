import type {
  IncomingMessage,
  SystemCommand,
  CommandResult,
  BotSessionExtended,
} from '#bot/types/bot_types'
import I18nManager from './i18n_manager.js'
import MessageBuilder from './message_builder.js'
import logger from '@adonisjs/core/services/logger'

export default class CommandSystem {
  private commands: SystemCommand[] = []
  private i18n: I18nManager
  private messageBuilder: MessageBuilder

  constructor() {
    this.i18n = I18nManager.getInstance()
    this.messageBuilder = new MessageBuilder()
    this.setupCommands()
  }

  private setupCommands(): void {
    this.commands = [
      {
        id: 'menu',
        aliases: ['menu', 'm', 'accueil'],
        execute: async (session) => this.goToMenu(session),
        blockedInOnboarding: true,
      },
      {
        id: 'back',
        aliases: ['*', 'retour', 'back'],
        execute: async (session) => this.goBack(session),
        blockedInOnboarding: false,
      },
      {
        id: 'language',
        aliases: ['fr', 'en', 'francais', 'english'],
        execute: async (session, input) => this.changeLanguage(session, input!),
        blockedInOnboarding: false,
      },
      {
        id: 'help',
        aliases: ['help', 'aide', '?'],
        execute: async (session) => this.showHelp(session),
        blockedInOnboarding: false,
      },
    ]
  }

  async tryExecute(message: IncomingMessage, session: BotSessionExtended): Promise<CommandResult> {
    const input = message.content.toLowerCase().trim()
    const command = this.commands.find((cmd) => cmd.aliases.includes(input))

    if (!command) return { handled: false }

    // Vérifier blocage onboarding
    if (session.currentWorkflow === 'onboarding' && !session.botUser.isVerified) {
      if (command.blockedInOnboarding) {
        logger.warn(
          { command: command.id, workflow: session.currentWorkflow },
          'Command blocked in onboarding'
        )
        await this.sendBlockedMessage(session)
        return { handled: true }
      }
    }

    logger.info({ command: command.id, userId: session.botUserId }, 'System command executed')
    await command.execute(session, input)
    return { handled: true }
  }

  private async changeLanguage(session: BotSessionExtended, input: string): Promise<void> {
    const newLang = ['fr', 'francais'].includes(input) ? 'fr' : 'en'

    session.botUser.language = newLang
    await session.botUser.save()

    logger.info({ userId: session.botUserId, newLanguage: newLang }, 'Language changed')

    // Re-afficher l'étape courante dans la nouvelle langue
    if (session.currentWorkflow && session.currentStep) {
      // Le workflow engine se chargera du re-affichage
      this.emit('language_changed', session)
    }
  }

  private async goBack(session: BotSessionExtended): Promise<void> {
    // Délégué au SessionManager via l'événement
    this.emit('navigation_back', session)
  }

  private async goToMenu(session: BotSessionExtended): Promise<void> {
    // Délégué au BotEngine via l'événement
    this.emit('show_main_menu', session)
  }

  private async showHelp(session: BotSessionExtended): Promise<void> {
    const message = this.messageBuilder.build({
      content: this.i18n.t('common.help_message', {}, session.botUser.language),
      footer: this.i18n.t('common.navigation.select_option', {}, session.botUser.language),
      language: session.botUser.language,
    })

    this.emit('send_message', { session, content: message })
  }

  private async sendBlockedMessage(session: BotSessionExtended): Promise<void> {
    const message = this.messageBuilder.build({
      content: this.i18n.t('errors.commands.menu_blocked_onboarding', {}, session.botUser.language),
      footer: this.i18n.t('common.navigation.continue_onboarding', {}, session.botUser.language),
      language: session.botUser.language,
    })

    this.emit('send_message', { session, content: message })
  }

  // Event emitter simple pour découplage
  private emit(event: string, data: any): void {
    // Sera remplacé par un vrai EventBus si nécessaire
    logger.debug({ event, data: Object.keys(data) }, 'Command system event emitted')
  }
}
