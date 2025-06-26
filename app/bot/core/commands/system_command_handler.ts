import BotSession from '#models/bot_session'
import BotUser from '#models/bot_user'
import I18nManager from '#bot/core/i18n_manager'
import MessageBuilder from '#bot/core/message_builder'
import ContextManager from '#bot/core/context_manager'
import type { SupportedLanguage, SystemCommand } from '#bot/types/bot_types'

/**
 * Gestionnaire des commandes système
 * Priorité absolue sur tous les autres handlers
 */
export default class SystemCommandHandler {
  private readonly i18n: I18nManager
  private readonly messageBuilder: MessageBuilder
  private readonly contextManager: ContextManager
  private readonly systemCommands: Map<string, SystemCommand>

  constructor() {
    this.i18n = I18nManager.getInstance()
    this.messageBuilder = new MessageBuilder()
    this.contextManager = new ContextManager()
    this.systemCommands = new Map()

    this.initializeSystemCommands()
  }

  /**
   * Initialise les commandes système avec leurs synonymes
   */
  private initializeSystemCommands(): void {
    const commands: SystemCommand[] = [
      {
        name: 'language_french',
        synonyms: ['fr', 'francais', 'français', 'fran'],
        restricted: false,
        priority: 10,
      },
      {
        name: 'language_english',
        synonyms: ['en', 'english', 'anglais', 'eng'],
        restricted: false,
        priority: 10,
      },
      {
        name: 'help',
        synonyms: ['aide', 'help', '?'],
        restricted: false,
        priority: 8,
      },
      {
        name: 'menu',
        synonyms: ['menu', 'accueil', 'home', 'start'],
        restricted: true, // Bloqué pendant certains workflows
        priority: 5,
      },
      {
        name: 'back',
        synonyms: ['*', 'retour', 'back', 'prev'],
        restricted: true, // Bloqué pendant certains workflows
        priority: 7,
      },
      {
        name: 'cancel',
        synonyms: ['annuler', 'cancel', 'stop', 'arreter'],
        restricted: false, // Toujours accessible
        priority: 9,
      },
    ]

    for (const command of commands) {
      for (const synonym of command.synonyms) {
        this.systemCommands.set(synonym.toLowerCase(), command)
      }
    }
  }

  /**
   * Traite un message et vérifie s'il s'agit d'une commande système
   */
  public async handle(session: BotSession, input: string): Promise<string | null> {
    const normalizedInput = input.toLowerCase().trim()
    const command = this.systemCommands.get(normalizedInput)

    if (!command) {
      return null // Pas une commande système
    }

    // Vérifier si la commande est restreinte dans le contexte actuel
    if (command.restricted && this.isCommandRestricted(session, command)) {
      return null // Commande bloquée dans ce contexte
    }

    // Récupérer l'utilisateur pour la langue
    const botUser = await session.related('botUser').query().firstOrFail()

    // Exécuter la commande appropriée
    switch (command.name) {
      case 'language_french':
        return await this.handleLanguageChange(session, botUser, 'fr')

      case 'language_english':
        return await this.handleLanguageChange(session, botUser, 'en')

      case 'help':
        return await this.handleHelp(botUser)

      case 'menu':
        return await this.handleMenu(session, botUser)

      case 'back':
        return await this.handleBack(session, botUser)

      case 'cancel':
        return await this.handleCancel(session, botUser)

      default:
        return null
    }
  }

  /**
   * Gère le changement de langue
   */
  private async handleLanguageChange(
    session: BotSession,
    botUser: BotUser,
    newLanguage: SupportedLanguage
  ): Promise<string> {
    const currentLanguage = botUser.language

    // Si même langue, ne rien faire
    if (currentLanguage === newLanguage) {
      return await this.renderCurrentState(session, botUser)
    }

    // Changer la langue
    await this.contextManager.changeLanguage(session.id, newLanguage)

    // Re-render l'état actuel dans la nouvelle langue (pas de message "langue changée")
    return await this.renderCurrentState(session, botUser)
  }

  /**
   * Gère la commande aide
   */
  private async handleHelp(botUser: BotUser): Promise<string> {
    return this.messageBuilder.buildHelp('commands.help_content', botUser.language)
  }

  /**
   * Gère la commande menu (retour au menu principal)
   */
  private async handleMenu(session: BotSession, botUser: BotUser): Promise<string> {
    // Abandonner le workflow actuel
    if (session.currentWorkflow) {
      await this.contextManager.abandonWorkflow(session.id)
    }

    // Afficher le menu principal
    return this.messageBuilder.buildMenu('common.main_menu', botUser.language)
  }

  /**
   * Gère la commande retour arrière
   */
  private async handleBack(session: BotSession, botUser: BotUser): Promise<string> {
    const canGoBack = await this.contextManager.goBack(session.id)

    if (!canGoBack) {
      // Impossible de revenir en arrière
      return this.messageBuilder.buildError('errors.cannot_go_back', botUser.language)
    }

    // Re-charger la session pour obtenir l'état mis à jour
    const updatedSession = await BotSession.findOrFail(session.id)
    return await this.renderCurrentState(updatedSession, botUser)
  }

  /**
   * Gère la commande annulation
   */
  private async handleCancel(session: BotSession, botUser: BotUser): Promise<string> {
    if (!session.currentWorkflow) {
      // Aucun workflow à annuler
      return this.messageBuilder.buildMenu('common.main_menu', botUser.language)
    }

    // Abandonner le workflow
    await this.contextManager.abandonWorkflow(session.id)

    // Confirmer l'annulation et retourner au menu
    return this.messageBuilder.build({
      content: 'commands.workflow_cancelled',
      footer: 'common.main_menu_footer',
      language: botUser.language,
    })
  }

  /**
   * Vérifie si une commande est restreinte dans le contexte actuel
   */
  private isCommandRestricted(session: BotSession, command: SystemCommand): boolean {
    if (!command.restricted) {
      return false // Commande toujours accessible
    }

    // Vérifier le contexte workflow
    const workflow = session.currentWorkflow
    const step = session.currentStep

    // Règles de restriction par workflow
    if (workflow === 'onboarding') {
      // Pendant l'onboarding, bloquer menu et retour
      if (command.name === 'menu' || command.name === 'back') {
        return true
      }
    }

    // Autres règles de restriction selon les besoins
    // TODO: Ajouter d'autres logiques selon les workflows

    return false
  }

  /**
   * Re-render l'état actuel de la session
   */
  private async renderCurrentState(session: BotSession, botUser: BotUser): Promise<string> {
    // Recharger l'utilisateur pour obtenir la langue mise à jour
    await botUser.refresh()

    // Si pas de workflow actuel, afficher le menu principal
    if (!session.currentWorkflow) {
      return this.messageBuilder.buildMenu('common.main_menu', botUser.language)
    }

    // TODO: Ici, on devrait déléguer au workflow engine pour re-render l'étape actuelle
    // Pour l'instant, message simple
    return this.messageBuilder.build({
      content: 'common.current_step',
      subheader: 'common.workflow_in_progress',
      footer: 'common.navigation_footer',
      language: botUser.language,
      params: {
        workflow: session.currentWorkflow,
        step: session.currentStep,
      },
    })
  }

  /**
   * Vérifie si un input est une commande système
   */
  public isSystemCommand(input: string): boolean {
    const normalizedInput = input.toLowerCase().trim()
    return this.systemCommands.has(normalizedInput)
  }

  /**
   * Récupère les commandes disponibles pour l'aide
   */
  public getAvailableCommands(): SystemCommand[] {
    const commands = new Map<string, SystemCommand>()

    for (const command of this.systemCommands.values()) {
      commands.set(command.name, command)
    }

    return Array.from(commands.values()).sort((a, b) => b.priority - a.priority)
  }

  /**
   * Récupère les synonymes d'une commande
   */
  public getCommandSynonyms(commandName: string): readonly string[] {
    for (const command of this.systemCommands.values()) {
      if (command.name === commandName) {
        return command.synonyms
      }
    }
    return []
  }
}
