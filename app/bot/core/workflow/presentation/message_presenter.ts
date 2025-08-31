import type { StepResult, WorkflowContext } from '../engine/workflow_context.js'
import MessageBuilder from '#bot/core/managers/message_builder'
import I18nManager from '#bot/core/managers/i18n_manager'
import { ProgressTracker } from './progress_tracker.js'

/**
 * Présentateur de messages workflow
 * Formate messages selon structure standard (header/subheader/content/footer)
 */
export class MessagePresenter {
  private static instance: MessagePresenter
  private messageBuilder: MessageBuilder
  private i18n: I18nManager
  private progressTracker: ProgressTracker

  private constructor() {
    this.messageBuilder = new MessageBuilder()
    this.i18n = I18nManager.getInstance()
    this.progressTracker = ProgressTracker.getInstance()
  }

  public static getInstance(): MessagePresenter {
    if (!MessagePresenter.instance) {
      MessagePresenter.instance = new MessagePresenter()
    }
    return MessagePresenter.instance
  }

  /**
   * Formate un résultat d'étape en message complet
   */
  public format(result: StepResult, context: WorkflowContext): string {
    const language = context.session.language

    // Construire contenu principal
    let content = ''
    if (result.messageKey) {
      content = this.i18n.t(result.messageKey, context.variables, language)
    } else if (result.content) {
      content = result.content
    } else if (result.error) {
      content = result.error
    }

    // Ajouter options de menu si présentes
    if (result.menuOptions && result.menuOptions.length > 0) {
      const optionsText = result.menuOptions.map((opt) => `${opt.id}. ${opt.label}`).join('\n')
      content += '\n\n' + optionsText
    }

    // Construire message complet
    return this.messageBuilder.build({
      content,
      subheader: this.getSubheader(context, result),
      footer: this.getFooter(context, result),
      language,
    })
  }

  /**
   * Génère subheader contextuel
   */
  private getSubheader(context: WorkflowContext, result: StepResult): string {
    // Erreur de validation - ajouter indication erreur
    if (result.action === 'validation_error') {
      const baseSubheader = this.getBaseSubheader(context)
      const errorSuffix = this.i18n.t(
        'common.subheader.validation_error',
        {},
        context.session.language
      )
      return baseSubheader ? `${baseSubheader} - ${errorSuffix}` : errorSuffix
    }

    return this.getBaseSubheader(context)
  }

  /**
   * Génère subheader de base selon workflow
   */
  private getBaseSubheader(context: WorkflowContext): string {
    const language = context.session.language

    // Progression pour onboarding
    if (context.workflowId === 'onboarding') {
      const progress = this.progressTracker.getProgress(context.workflowId, context.currentStep)

      if (progress) {
        const stepText = this.i18n.t(
          'common.subheader.step_progress',
          {
            current: progress.current,
            total: progress.total,
          },
          language
        )

        return `${progress.prefix} - ${stepText}`
      }
    }

    // Autres workflows - nom workflow simple
    const workflow = context.session.currentWorkflow
    return workflow ? this.i18n.t(`workflows.${workflow}.name`, {}, language) || workflow : ''
  }

  /**
   * Génère footer contextuel
   */
  private getFooter(context: WorkflowContext, result: StepResult): string {
    const language = context.session.language

    // Footer spécifique selon action
    switch (result.action) {
      case 'validation_error':
        return this.i18n.t('common.footer.retry', {}, language)

      case 'complete_workflow':
        return this.i18n.t('common.footer.workflow_complete', {}, language)

      default:
        return this.getContextualFooter(context)
    }
  }

  /**
   * Génère footer selon contexte workflow/étape
   */
  private getContextualFooter(context: WorkflowContext): string {
    const language = context.session.language

    // Footer onboarding contextuel
    if (context.workflowId === 'onboarding') {
      const progress = this.progressTracker.getProgress(context.workflowId, context.currentStep)

      if (progress) {
        switch (progress.current) {
          case 1:
            return this.i18n.t('common.footer.onboarding_step1', {}, language)
          case 2:
            return this.i18n.t('common.footer.onboarding_step2', {}, language)
          case 3:
            return this.i18n.t('common.footer.onboarding_step3', {}, language)
        }
      }
    }

    // Footer générique
    return this.i18n.t('common.footer.workflow_navigation', {}, language)
  }

  /**
   * Formate message d'erreur système
   */
  public formatError(error: string, context: WorkflowContext): string {
    const language = context.session.language

    return this.messageBuilder.build({
      content: this.i18n.t('common.error.system', { error }, language),
      subheader:
        this.getBaseSubheader(context) +
        ' - ' +
        this.i18n.t('common.subheader.error', {}, language),
      footer: this.i18n.t('common.footer.error_recovery', {}, language),
      language,
    })
  }

  /**
   * Formate message de completion workflow
   */
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
