import type { MessageBuildOptions, SupportedLanguage } from '#bot/types/bot_types'
import I18nManager from './i18n_manager.js'

/**
 * Constructeur de messages avec format standardisé
 * Structure: Header + Subheader + Content + Footer
 */
export default class MessageBuilder {
  private static readonly SEPARATOR = '-'.repeat(45)
  private readonly i18n: I18nManager

  constructor() {
    this.i18n = I18nManager.getInstance()
  }

  /**
   * Construit un message complet avec format standardisé
   */
  public build(options: MessageBuildOptions): string {
    const header = this.buildHeader(options.language)
    const subheader = this.buildSubheader(options.subheader, options.language, options.params)
    const content = this.buildContent(options.content, options.language, options.params)
    const footer = this.buildFooter(options.footer, options.language, options.params)

    return this.assembleMessage(header, subheader, content, footer)
  }

  /**
   * Construit uniquement le header (toujours présent)
   */
  private buildHeader(language: SupportedLanguage): string {
    return this.i18n.t('common.bot_header', {}, language)
  }

  /**
   * Construit le subheader si fourni
   */
  private buildSubheader(
    subheader: string | undefined,
    language: SupportedLanguage,
    params: Record<string, any> = {}
  ): string | null {
    if (!subheader) {
      return null
    }

    return this.i18n.t(subheader, params, language)
  }

  /**
   * Construit le contenu principal (obligatoire)
   */
  private buildContent(
    content: string,
    language: SupportedLanguage,
    params: Record<string, any> = {}
  ): string {
    return this.i18n.t(content, params, language)
  }

  /**
   * Construit le footer si fourni
   */
  private buildFooter(
    footer: string | undefined,
    language: SupportedLanguage,
    params: Record<string, any> = {}
  ): string | null {
    if (!footer) {
      return null
    }

    return this.i18n.t(footer, params, language)
  }

  /**
   * Assemble tous les éléments du message
   */
  private assembleMessage(
    header: string,
    subheader: string | null,
    content: string,
    footer: string | null
  ): string {
    let message = header

    // Ajouter subheader si présent
    if (subheader) {
      message += `\n\n${subheader}`
    }

    // Ajouter contenu (toujours présent)
    message += `\n\n${content}`

    // Ajouter footer si présent
    if (footer) {
      message += `\n\n${MessageBuilder.SEPARATOR}\n${footer}`
    }

    return message
  }

  /**
   * Construit un message d'erreur standardisé
   */
  public buildError(
    errorKey: string,
    language: SupportedLanguage,
    params: Record<string, any> = {}
  ): string {
    return this.build({
      content: errorKey,
      footer: 'common.try_again_footer',
      language,
      params,
    })
  }

  /**
   * Construit un message de succès standardisé
   */
  public buildSuccess(
    successKey: string,
    language: SupportedLanguage,
    params: Record<string, any> = {}
  ): string {
    return this.build({
      content: successKey,
      footer: 'common.continue_footer',
      language,
      params,
    })
  }

  /**
   * Construit un message d'aide standardisé
   */
  public buildHelp(
    helpKey: string,
    language: SupportedLanguage,
    params: Record<string, any> = {}
  ): string {
    return this.build({
      content: helpKey,
      footer: 'common.commands_footer',
      language,
      params,
    })
  }

  /**
   * Construit un message de workflow avec étapes
   */
  public buildWorkflowStep(
    workflowKey: string,
    stepKey: string,
    current: number,
    total: number,
    language: SupportedLanguage,
    params: Record<string, any> = {}
  ): string {
    return this.build({
      content: `${workflowKey}.${stepKey}`,
      subheader: 'common.step_progress',
      footer: 'common.navigation_footer',
      language,
      params: {
        ...params,
        current,
        total,
      },
    })
  }

  /**
   * Construit un message de menu avec options
   */
  public buildMenu(
    menuKey: string,
    language: SupportedLanguage,
    params: Record<string, any> = {}
  ): string {
    return this.build({
      content: menuKey,
      footer: 'common.menu_footer',
      language,
      params,
    })
  }

  /**
   * Construit un message de validation avec retry
   */
  public buildValidationError(
    validationKey: string,
    language: SupportedLanguage,
    params: Record<string, any> = {}
  ): string {
    return this.build({
      content: `errors.validation.${validationKey}`,
      footer: 'common.retry_footer',
      language,
      params,
    })
  }

  /**
   * Construit un message de loading/processing
   */
  public buildProcessing(
    processingKey: string,
    language: SupportedLanguage,
    params: Record<string, any> = {}
  ): string {
    return this.build({
      content: processingKey,
      language,
      params,
    })
  }

  /**
   * Vérifie si une clé de traduction existe avant de construire
   */
  public canBuild(
    contentKey: string,
    language: SupportedLanguage,
    subheaderKey?: string,
    footerKey?: string
  ): boolean {
    // Vérifier que le contenu existe (obligatoire)
    if (!this.i18n.hasTranslation(contentKey, language)) {
      return false
    }

    // Vérifier subheader si fourni
    if (subheaderKey && !this.i18n.hasTranslation(subheaderKey, language)) {
      return false
    }

    // Vérifier footer si fourni
    if (footerKey && !this.i18n.hasTranslation(footerKey, language)) {
      return false
    }

    return true
  }

  /**
   * Construit un message avec fallback si clés manquantes
   */
  public buildSafe(options: MessageBuildOptions): string {
    if (this.canBuild(options.content, options.language, options.subheader, options.footer)) {
      return this.build(options)
    }

    // Fallback vers message d'erreur générique
    return this.build({
      content: 'errors.translation_missing',
      language: options.language,
      params: { key: options.content },
    })
  }

  /**
   * Récupère le séparateur utilisé
   */
  public static getSeparator(): string {
    return MessageBuilder.SEPARATOR
  }
}
