import type { Handler, HandlerResult, HandlerMetadata } from '#bot/contracts/handler.contract'
import type { StateContext } from '#bot/types/state.types'
import type { BotState } from '#bot/types/state.types'
import I18nManager from '#bot/core/managers/i18n_manager'
import MessageBuilder from '#bot/core/managers/message_builder'
import logger from '@adonisjs/core/services/logger'

/**
 * Classe de base pour tous les handlers
 */
export abstract class BaseHandler implements Handler {
  protected i18n: I18nManager
  protected messageBuilder: MessageBuilder

  abstract readonly name: string
  abstract readonly supportedStates: string[]

  constructor() {
    this.i18n = I18nManager.getInstance()
    this.messageBuilder = new MessageBuilder()
  }

  /**
   * Vérifie si ce handler peut traiter la requête
   */
  canHandle(context: StateContext, input: string): boolean {
    // Vérifier si l'état est supporté
    if (!this.supportedStates.includes(context.currentState)) {
      return false
    }

    // Les classes dérivées peuvent ajouter des conditions supplémentaires
    return this.canHandleSpecific(context, input)
  }

  /**
   * Condition supplémentaire pour les classes dérivées
   */
  protected canHandleSpecific(context: StateContext, input: string): boolean {
    return true
  }

  /**
   * Traite la requête (à implémenter par les classes dérivées)
   */
  abstract handle(context: StateContext, input: string): Promise<HandlerResult>

  /**
   * Construit un message formaté
   */
  protected buildMessage(
    content: string | { key: string; params?: any },
    context: StateContext,
    options?: {
      subheader?: string
      footer?: string
      useDefaultFooter?: boolean
    }
  ): string {
    const language = context.session.language

    // Résoudre le contenu si c'est une clé i18n
    const resolvedContent =
      typeof content === 'string'
        ? content
        : this.i18n.t(content.key, content.params || {}, language)

    // Footer par défaut si demandé
    const footer =
      options?.footer ||
      (options?.useDefaultFooter ? this.i18n.t('common.footer_options', {}, language) : undefined)

    return this.messageBuilder.build({
      content: resolvedContent,
      subheader: options?.subheader,
      footer,
      language,
      params: {},
    })
  }

  /**
   * Crée un résultat de succès
   */
  protected successResult(message: string, nextState?: BotState, stateData?: any): HandlerResult {
    return {
      success: true,
      message,
      nextState,
      stateData,
      completed: false,
    }
  }

  /**
   * Crée un résultat d'erreur
   */
  protected errorResult(error: string, context: StateContext): HandlerResult {
    const language = context.session.language
    const errorMessage = this.i18n.t('errors.handler_error', { error }, language)

    return {
      success: false,
      error: errorMessage,
      completed: false,
    }
  }

  /**
   * Crée un résultat de completion
   */
  protected completedResult(message?: string, stateData?: any): HandlerResult {
    return {
      success: true,
      message,
      stateData,
      completed: true,
    }
  }

  /**
   * Log une action du handler
   */
  protected log(
    level: 'info' | 'warn' | 'error',
    message: string,
    context: StateContext,
    data?: any
  ): void {
    const logData = {
      handler: this.name,
      state: context.currentState,
      sessionId: `${context.session.channel}:${context.session.channelUserId}`,
      language: context.session.language,
      ...data,
    }

    logger[level](logData, message)
  }

  /**
   * Extrait une commande de l'input
   */
  protected extractCommand(input: string): string | null {
    const normalized = input.toLowerCase().trim()

    // Commandes système communes
    const systemCommands = ['menu', 'aide', 'help', 'armelle', 'retour', 'back', 'fr', 'en']

    for (const cmd of systemCommands) {
      if (normalized === cmd) {
        return cmd
      }
    }

    return null
  }

  /**
   * Vérifie si l'input est une sélection numérique
   */
  protected parseSelection(input: string): number | null {
    const trimmed = input.trim()
    const num = Number.parseInt(trimmed, 10)

    if (!Number.isNaN(num) && num >= 0 && num <= 99) {
      return num
    }

    return null
  }

  /**
   * Nettoyage optionnel
   */
  async cleanup(context: StateContext): Promise<void> {
    // Par défaut, rien à nettoyer
    // Les classes dérivées peuvent override
    this.log('info', 'Handler cleanup', context)
  }

  /**
   * Obtient les métadonnées du handler
   */
  getMetadata(): HandlerMetadata {
    return {
      name: this.name,
      description: `Base handler: ${this.name}`,
      version: '1.0.0',
    }
  }
}
