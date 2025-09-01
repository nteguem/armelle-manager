import type { SessionContext } from '#bot/types/bot_types'
import I18nManager from '#bot/core/managers/i18n_manager'
import MessageBuilder from '#bot/core/managers/message_builder'

export default class MenuNavigationHandler {
  private i18n: I18nManager
  private messageBuilder: MessageBuilder

  constructor() {
    this.i18n = I18nManager.getInstance()
    this.messageBuilder = new MessageBuilder()
  }

  public async handle(sessionContext: SessionContext, input: string): Promise<void> {
    // Pour l'instant, réponse IA générique
    // Sera remplacé par le provider IA (Claude, etc.)

    const message = this.messageBuilder.build({
      subheader: this.i18n.t('common.main_menu.ai_ready', {}, sessionContext.language),
      content: this.i18n.t('common.main_menu.ai_response', {}, sessionContext.language),
      footer: this.i18n.t('common.main_menu.footer', {}, sessionContext.language),
      language: sessionContext.language,
    })

    await this.sendMessage(sessionContext, message)
  }

  private async sendMessage(sessionContext: SessionContext, content: string): Promise<void> {
    // Cette méthode sera fournie par MessageRouter
    console.log('Send message - to be provided by MessageRouter')
  }
}
