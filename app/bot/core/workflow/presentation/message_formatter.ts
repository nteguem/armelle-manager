import type { StepResult, WorkflowContext } from '../engine/workflow_context.js'
import { WorkflowProgressConfigs } from '#config/workflows'
import I18nManager from '#bot/core/managers/i18n_manager'

export default class MessageFormatter {
  private i18n: I18nManager

  constructor() {
    this.i18n = I18nManager.getInstance()
  }

  public formatSubheader(context: WorkflowContext, result?: StepResult): string {
    const language = context.session.language

    if (result && result.action === 'validation_error') {
      const baseSubheader = this.getBaseSubheader(context)
      const errorSuffix = this.i18n.t('common.subheader.validation_error', {}, language)
      return baseSubheader ? `${baseSubheader} - ${errorSuffix}` : errorSuffix
    }

    return this.getBaseSubheader(context)
  }

  public formatFooter(context: WorkflowContext, result?: StepResult): string {
    const language = context.session.language

    if (result) {
      switch (result.action) {
        case 'validation_error':
          return this.i18n.t('common.footer.retry', {}, language)
        case 'complete_workflow':
          return this.i18n.t('common.footer.workflow_complete', {}, language)
      }
    }

    return this.getContextualFooter(context)
  }

  private getBaseSubheader(context: WorkflowContext): string {
    const language = context.session.language

    // Si pas de workflow (contexte vide pour menu principal), retourner subheader menu
    if (!context.workflowId) {
      return this.i18n.t('common.main_menu.subtitle', {}, language)
    }

    const config = WorkflowProgressConfigs[context.workflowId]

    if (config) {
      const currentStepNumber = config.stepMapping[context.currentStep]
      if (currentStepNumber) {
        const stepText = this.i18n.t(
          'common.subheader.step_progress',
          { current: currentStepNumber, total: config.totalSteps },
          language
        )
        return `${config.prefix} - ${stepText}`
      }
    }

    const workflow = context.session.currentWorkflow
    return workflow ? this.i18n.t(`workflows.${workflow}.name`, {}, language) || workflow : ''
  }

  private getContextualFooter(context: WorkflowContext): string {
    const language = context.session.language

    // Si pas de workflow (menu principal), retourner footer menu
    if (!context.workflowId) {
      return this.i18n.t('common.main_menu.footer', {}, language)
    }

    const config = WorkflowProgressConfigs[context.workflowId]

    if (config) {
      const currentStepNumber = config.stepMapping[context.currentStep]
      if (currentStepNumber) {
        const footerKey = `common.footer.${context.workflowId}_step${currentStepNumber}`
        const footer = this.i18n.t(footerKey, {}, language)
        if (footer !== footerKey) {
          return footer
        }
      }
    }

    return this.i18n.t('common.footer.workflow_navigation', {}, language)
  }
}
