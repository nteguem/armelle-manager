import type { StepResult, WorkflowContext } from '../engine/workflow_context.js'
import MessageBuilder from '#bot/core/managers/message_builder'
import I18nManager from '#bot/core/managers/i18n_manager'
import MessageFormatter from './message_formatter.js'

export class MessagePresenter {
  private static instance: MessagePresenter
  private messageBuilder: MessageBuilder
  private i18n: I18nManager
  private messageFormatter: MessageFormatter

  private constructor() {
    this.messageBuilder = new MessageBuilder()
    this.i18n = I18nManager.getInstance()
    this.messageFormatter = new MessageFormatter()
  }

  public static getInstance(): MessagePresenter {
    if (!MessagePresenter.instance) {
      MessagePresenter.instance = new MessagePresenter()
    }
    return MessagePresenter.instance
  }

  public format(result: StepResult, context: WorkflowContext): string {
    const language = context.session.language

    // Construire contenu principal
    let content = ''
    if ('messageKey' in result && result.messageKey) {
      content = this.i18n.t(result.messageKey, context.variables, language)
    } else if ('content' in result && result.content) {
      content = result.content
    } else if ('error' in result && result.error) {
      content = result.error
    }

    // Ajouter options menu si présentes
    if ('menuOptions' in result && result.menuOptions && result.menuOptions.length > 0) {
      const optionsText = result.menuOptions.map((opt) => `${opt.id}. ${opt.label}`).join('\n')
      content += '\n\n' + optionsText
    }

    return this.messageBuilder.build({
      content,
      subheader: this.messageFormatter.formatSubheader(context, result),
      footer: this.messageFormatter.formatFooter(context, result),
      language,
    })
  }

  public formatError(error: string, context: WorkflowContext): string {
    const language = context.session.language

    return this.messageBuilder.build({
      content: this.i18n.t('common.error.system', { error }, language),
      subheader:
        this.messageFormatter.formatSubheader(context) +
        ' - ' +
        this.i18n.t('common.subheader.error', {}, language),
      footer: this.i18n.t('common.footer.error_recovery', {}, language),
      language,
    })
  }

  public formatCompletion(context: WorkflowContext, completionData?: Record<string, any>): string {
    const language = context.session.language
    const messageKey = `workflows.${context.workflowId}.complete`

    return this.messageBuilder.build({
      content: this.i18n.t(messageKey, completionData || {}, language),
      footer: this.i18n.t('common.footer.workflow_complete', {}, language),
      language,
    })
  }
}
