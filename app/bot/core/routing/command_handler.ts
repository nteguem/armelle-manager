import type { SessionContext, SupportedLanguage } from '#bot/types/bot_types'
import CommandManager from '#bot/core/managers/command_manager'
import SessionManager from '#bot/core/managers/session_manager'
import I18nManager from '#bot/core/managers/i18n_manager'
import MessageBuilder from '#bot/core/managers/message_builder'
import BotMessage from '#models/bot/bot_message'

export default class CommandHandler {
  private commandManager: CommandManager
  private sessionManager: SessionManager
  private i18n: I18nManager
  private messageBuilder: MessageBuilder

  constructor(private sendMessageFn?: Function) {
    this.commandManager = CommandManager.getInstance()
    this.sessionManager = SessionManager.getInstance()
    this.i18n = I18nManager.getInstance()
    this.messageBuilder = new MessageBuilder()
  }

  public async canHandle(content: string, sessionContext: SessionContext): Promise<boolean> {
    const commandResult = this.commandManager.detectCommand(content, sessionContext)
    return commandResult.detected
  }

  public async handle(
    content: string,
    sessionContext: SessionContext,
    botMessage: BotMessage
  ): Promise<void> {
    const commandResult = this.commandManager.detectCommand(content, sessionContext)

    await botMessage.recordSystemCommand(commandResult.type || 'unknown', !commandResult.blocked)

    if (commandResult.blocked) {
      const errorMessage = this.messageBuilder.build({
        content:
          commandResult.reason ||
          this.i18n.t('errors.commands.not_allowed_in_context', {}, sessionContext.language),
        language: sessionContext.language,
      })
      await this.sendMessage(sessionContext, errorMessage)
      return
    }

    switch (commandResult.command) {
      case 'language':
        await this.handleLanguageCommand(commandResult.type || 'unknown', sessionContext)
        break
      case 'navigation':
        await this.handleNavigationCommand(commandResult.type || 'unknown', sessionContext)
        break
    }
  }

  private async handleLanguageCommand(
    commandType: string,
    sessionContext: SessionContext
  ): Promise<void> {
    const newLanguage = this.commandManager.getLanguageTarget(commandType)
    if (!newLanguage) return

    await this.sessionManager.updateUserLanguage(sessionContext, newLanguage as SupportedLanguage)

    if (sessionContext.currentWorkflow) {
      await this.redisplayCurrentWorkflowStep(sessionContext)
    } else {
      await this.displayMainMenu(sessionContext)
    }
  }

  private async handleNavigationCommand(
    commandType: string,
    sessionContext: SessionContext
  ): Promise<void> {
    switch (commandType) {
      case 'help':
        await this.displayContextualHelp(sessionContext)
        break
      case 'menu':
        await this.sessionManager.endWorkflow(sessionContext)
        await this.displayMainMenu(sessionContext)
        break
    }
  }

  private async displayMainMenu(sessionContext: SessionContext): Promise<void> {
    const message = this.messageBuilder.build({
      content: this.i18n.t('common.main_menu.welcome_back', {}, sessionContext.language),
      subheader: this.i18n.t('common.main_menu.subtitle', {}, sessionContext.language),
      footer: this.i18n.t('common.main_menu.footer', {}, sessionContext.language),
      language: sessionContext.language,
    })
    await this.sendMessage(sessionContext, message)
  }

  private async displayContextualHelp(sessionContext: SessionContext): Promise<void> {
    const helpMessage = this.messageBuilder.build({
      content: this.i18n.t('common.help_message', {}, sessionContext.language),
      language: sessionContext.language,
    })
    await this.sendMessage(sessionContext, helpMessage)
  }

  private async redisplayCurrentWorkflowStep(sessionContext: SessionContext): Promise<void> {
    // Cette logique sera déléguée au WorkflowOrchestrator
    console.log('Redisplay workflow step - to be implemented in WorkflowOrchestrator')
  }

  private async sendMessage(sessionContext: SessionContext, content: string): Promise<void> {
    if (this.sendMessageFn) {
      await this.sendMessageFn(sessionContext, content)
    }
  }
}
