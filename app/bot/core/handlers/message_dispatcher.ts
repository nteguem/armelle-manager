import BotMessage from '#models/bot_message'
import CommandManager from '#bot/core/managers/command_manager'
import SessionManager from '#bot/core/managers/session_manager'
import I18nManager from '#bot/core/managers/i18n_manager'
import MessageBuilder from '#bot/core/managers/message_builder'
import type {
  IncomingMessage,
  OutgoingMessage,
  SessionContext,
  ChannelAdapter,
} from '#bot/types/bot_types'

export default class MessageDispatcher {
  private commandManager: CommandManager
  private sessionManager: SessionManager
  private i18n: I18nManager
  private messageBuilder: MessageBuilder
  private adapters: Map<string, ChannelAdapter> = new Map()

  constructor() {
    this.commandManager = CommandManager.getInstance()
    this.sessionManager = SessionManager.getInstance()
    this.i18n = I18nManager.getInstance()
    this.messageBuilder = new MessageBuilder()
  }

  /**
   * Enregistre un adaptateur de canal
   */
  public registerAdapter(channel: string, adapter: ChannelAdapter): void {
    this.adapters.set(channel, adapter)
  }

  /**
   * Point d'entrée principal pour traiter un message entrant
   */
  public async handleIncomingMessage(incomingMessage: IncomingMessage): Promise<void> {
    const startTime = Date.now()
    let botMessage: BotMessage | null = null

    try {
      // 1. Récupérer ou créer la session
      const sessionContext = await this.sessionManager.getOrCreateSession(
        incomingMessage.channel,
        incomingMessage.channelUserId
      )

      // 2. Sauvegarder le message entrant
      const botSession = await this.getBotSession(sessionContext)
      botMessage = await BotMessage.createIncoming({
        session: botSession,
        content: incomingMessage.content,
        messageType: incomingMessage.messageType,
        rawData: incomingMessage.rawData,
      })

      // 3. Détecter les commandes système (priorité absolue)
      const commandResult = this.commandManager.detectCommand(
        incomingMessage.content,
        sessionContext
      )

      if (commandResult.detected) {
        await this.handleSystemCommand(commandResult, sessionContext, botMessage)
        return
      }

      // 4. Vérifier si l'onboarding est requis
      if (!sessionContext.isVerified) {
        await this.handleOnboardingRequired(sessionContext)
        return
      }

      // 5. Traitement selon le contexte
      if (sessionContext.currentWorkflow) {
        await this.handleWorkflowMessage(sessionContext, incomingMessage.content)
      } else {
        await this.handleMenuNavigation(sessionContext, incomingMessage.content)
      }
    } catch (error) {
      console.error('❌ Error processing message:', error)
      await this.handleError(incomingMessage, error as Error, botMessage)
    } finally {
      // Marquer le message comme traité
      if (botMessage) {
        const duration = Date.now() - startTime
        await botMessage.markAsProcessed(duration)
      }
    }
  }

  /**
   * Gère les commandes système détectées
   */
  private async handleSystemCommand(
    commandResult: any,
    sessionContext: SessionContext,
    botMessage: BotMessage
  ): Promise<void> {
    // Enregistrer la commande détectée
    await botMessage.recordSystemCommand(commandResult.type, !commandResult.blocked)

    if (commandResult.blocked) {
      // Commande bloquée - envoyer message d'erreur
      const errorMessage = this.messageBuilder.build({
        content:
          commandResult.reason ||
          this.i18n.t('errors.commands.not_allowed_in_context', {}, sessionContext.language),
        language: sessionContext.language,
      })

      await this.sendMessage(sessionContext, errorMessage)
      return
    }

    // Traiter la commande selon son type
    switch (commandResult.command) {
      case 'language':
        await this.handleLanguageCommand(commandResult.type, sessionContext)
        break

      case 'navigation':
        await this.handleNavigationCommand(commandResult.type, sessionContext)
        break

      case 'workflow':
        await this.handleWorkflowCommand(commandResult.type, sessionContext)
        break
    }
  }

  /**
   * Gère le changement de langue (transparent)
   */
  private async handleLanguageCommand(
    commandType: string,
    sessionContext: SessionContext
  ): Promise<void> {
    const newLanguage = this.commandManager.getLanguageTarget(commandType)
    if (!newLanguage) return

    // Changer la langue de l'utilisateur
    await this.sessionManager.updateUserLanguage(sessionContext, newLanguage)

    // Re-afficher le contenu actuel dans la nouvelle langue
    if (sessionContext.currentWorkflow) {
      // En workflow - re-afficher l'étape courante
      await this.redisplayCurrentWorkflowStep(sessionContext)
    } else {
      // Au menu - re-afficher le menu principal
      await this.displayMainMenu(sessionContext)
    }
  }

  /**
   * Gère les commandes de navigation
   */
  private async handleNavigationCommand(
    commandType: string,
    sessionContext: SessionContext
  ): Promise<void> {
    switch (commandType) {
      case 'help':
        await this.displayContextualHelp(sessionContext)
        break

      case 'menu':
        // Retour au menu principal
        await this.sessionManager.endWorkflow(sessionContext)
        await this.displayMainMenu(sessionContext)
        break

      case 'back':
        await this.handleWorkflowBack(sessionContext)
        break
    }
  }

  /**
   * Gère l'onboarding requis
   */
  private async handleOnboardingRequired(sessionContext: SessionContext): Promise<void> {
    // TODO: Phase 2 - Démarrer le workflow onboarding
    const message = this.messageBuilder.build({
      content: this.i18n.t('common.continue_onboarding', {}, sessionContext.language),
      language: sessionContext.language,
    })

    await this.sendMessage(sessionContext, message)
  }

  /**
   * Gère la navigation dans le menu principal
   */
  private async handleMenuNavigation(sessionContext: SessionContext, input: string): Promise<void> {
    // TODO: Phase 2 - Intégration avec MenuManager
    const message = this.messageBuilder.build({
      content: this.i18n.t('errors.menu.invalid_choice', {}, sessionContext.language),
      footer: this.i18n.t('common.navigation.select_option', {}, sessionContext.language),
      language: sessionContext.language,
    })

    await this.sendMessage(sessionContext, message)
  }

  /**
   * Affiche le menu principal
   */
  private async displayMainMenu(sessionContext: SessionContext): Promise<void> {
    // TODO: Phase 2 - Intégration avec MenuManager
    const message = this.messageBuilder.build({
      content: this.i18n.t('common.main_menu.title', {}, sessionContext.language),
      footer: this.i18n.t('common.main_menu.footer', {}, sessionContext.language),
      language: sessionContext.language,
    })

    await this.sendMessage(sessionContext, message)
  }

  /**
   * Affiche l'aide contextuelle
   */
  private async displayContextualHelp(sessionContext: SessionContext): Promise<void> {
    const helpMessage = this.messageBuilder.build({
      content: this.i18n.t('common.help_message', {}, sessionContext.language),
      language: sessionContext.language,
    })

    await this.sendMessage(sessionContext, helpMessage)
  }

  /**
   * Envoie un message via l'adaptateur approprié
   */
  private async sendMessage(sessionContext: SessionContext, content: string): Promise<void> {
    const adapter = this.adapters.get(sessionContext.channel)
    if (!adapter) {
      throw new Error(`No adapter found for channel: ${sessionContext.channel}`)
    }

    const outgoingMessage: OutgoingMessage = {
      channel: sessionContext.channel,
      to: sessionContext.channelUserId,
      content,
      messageType: 'text',
    }

    await adapter.sendMessage(outgoingMessage)

    // Sauvegarder le message sortant
    const botSession = await this.getBotSession(sessionContext)
    await BotMessage.createOutgoing({
      session: botSession,
      content,
      messageType: 'text',
    })
  }

  /**
   * Récupère la session BotSession depuis le contexte
   */
  private async getBotSession(sessionContext: SessionContext): Promise<any> {
    // Import dynamique pour éviter les dépendances circulaires
    const botSessionModule = await import('#models/bot_session')
    const BotSession = botSessionModule.default
    return await BotSession.findActiveSession(sessionContext.channel, sessionContext.channelUserId)
  }

  /**
   * Gère les erreurs de traitement
   */
  private async handleError(
    incomingMessage: IncomingMessage,
    error: Error,
    botMessage: BotMessage | null
  ): Promise<void> {
    console.error('❌ MessageDispatcher Error:', error.message)

    if (botMessage) {
      await botMessage.markAsError(error.message)
    }

    // TODO: Envoyer message d'erreur générique à l'utilisateur
  }

  // Méthodes placeholder pour Phase 2
  private async handleWorkflowMessage(
    sessionContext: SessionContext,
    input: string
  ): Promise<void> {
    // TODO: Phase 2 - Intégration WorkflowEngine
  }

  private async handleWorkflowCommand(
    commandType: string,
    sessionContext: SessionContext
  ): Promise<void> {
    // TODO: Phase 2 - Commandes workflow (cancel, restart)
  }

  private async handleWorkflowBack(sessionContext: SessionContext): Promise<void> {
    // TODO: Phase 2 - Navigation arrière workflow
  }

  private async redisplayCurrentWorkflowStep(sessionContext: SessionContext): Promise<void> {
    // TODO: Phase 2 - Re-affichage étape workflow
  }
}
