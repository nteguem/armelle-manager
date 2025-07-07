import type { MessageOptions, SupportedLanguage, ProgressInfo } from '#bot/types/bot_types'
import I18nManager from './i18n_manager.js'
import logger from '@adonisjs/core/services/logger'

export default class MessageBuilder {
  private static readonly SEPARATOR = '-'.repeat(45)
  private i18n: I18nManager

  constructor() {
    this.i18n = I18nManager.getInstance()
  }

  build(options: MessageOptions): string {
    const parts: string[] = []

    // Header constant
    parts.push(this.i18n.t('common.bot_header', {}, options.language))

    // Subheader optionnel
    if (options.subheader) {
      parts.push('')
      parts.push(options.subheader)
    }

    // Contenu principal
    parts.push('')
    parts.push(this.interpolate(options.content, options.params || {}))

    // Séparateur + Footer
    if (options.footer) {
      parts.push('')
      parts.push(MessageBuilder.SEPARATOR)
      parts.push(options.footer)
    }

    logger.debug({ language: options.language }, 'Message built successfully')
    return parts.join('\n')
  }

  buildWithProgress(
    contentKey: string,
    progress: ProgressInfo,
    footerKey: string,
    language: SupportedLanguage,
    params: Record<string, any> = {}
  ): string {
    // Subheader avec progression
    let subheader = this.i18n.t(
      'common.step_progress',
      {
        current: progress.current,
        total: progress.total,
      },
      language
    )

    // Si on a un nom de sous-flow, l'ajouter
    if (progress.subflowName) {
      subheader = `${progress.subflowName} - ${subheader}`
    }

    logger.debug(
      {
        contentKey,
        progress,
        language,
      },
      'Message with progress built'
    )

    return this.build({
      content: this.i18n.t(contentKey, params, language),
      subheader,
      footer: this.i18n.t(footerKey, params, language),
      language,
      params,
    })
  }

  private interpolate(text: string, params: Record<string, any>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, param) => {
      return params.hasOwnProperty(param) ? String(params[param]) : match
    })
  }
}
