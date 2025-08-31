import type {
  WorkflowStepDefinition,
  WorkflowContext,
  StepResult,
  MenuOption,
} from '../engine/workflow_context.js'
import { BaseStep } from './base_step.js'
import I18nManager from '#bot/core/managers/i18n_manager'

export class MenuStep extends BaseStep {
  readonly type = 'menu'

  public async execute(
    stepDefinition: WorkflowStepDefinition,
    context: WorkflowContext,
    userInput?: string
  ): Promise<StepResult> {
    const config = stepDefinition.config

    if (!userInput) {
      const menuOptions = this.generateMenuOptions(config, context)

      if (menuOptions.length > 10 && config.maxOptions) {
        return this.handleTooManyOptions(config, context)
      }

      const saveData = {
        current_menu_options: menuOptions,
      }

      return {
        action: 'send_message',
        messageKey: config.messageKey,
        menuOptions,
        saveData,
      }
    }

    return this.processUserChoice(config, context, userInput, stepDefinition)
  }

  private generateMenuOptions(config: Record<string, any>, context: WorkflowContext): MenuOption[] {
    let options: MenuOption[] = []

    if (config.options) {
      options = config.options.map((opt: any, index: number) => {
        let label = opt.label
        if (typeof label === 'string' && label.includes('workflows.')) {
          const i18nManager = I18nManager.getInstance()
          label = i18nManager.t(label, {}, context.session.language)
        }

        return {
          id: opt.id || String(index + 1),
          label,
          value: opt.value,
        }
      })
    }

    if (config.dynamicSource && !options.length) {
      const sourceData = this.getNestedValue(context.variables, config.dynamicSource)
      if (Array.isArray(sourceData)) {
        let dataToProcess = sourceData

        // Gestion limite générique
        if (config.maxOptions && sourceData.length > config.maxOptions) {
          dataToProcess = sourceData.slice(0, config.maxOptions)

          // Ajouter option overflow si configurée
          if (config.overflowMessageKey && config.overflowValue) {
            const i18nManager = I18nManager.getInstance()
            options.push({
              id: String(config.maxOptions + 1),
              label: i18nManager.t(config.overflowMessageKey, {}, context.session.language),
              value: config.overflowValue,
            })
          }
        }

        // Générer options depuis les données
        const dynamicOptions = dataToProcess.map((item: any, index: number) => ({
          id: String(index + 1),
          label: this.formatDynamicOption(item, config.labelTemplate),
          value: item,
        }))

        // Insérer les options dynamiques avant l'overflow
        if (config.overflowMessageKey && sourceData.length > config.maxOptions) {
          options.unshift(...dynamicOptions)
        } else {
          options.push(...dynamicOptions)
        }

        // Ajouter option "Aucun" si configurée
        if (config.addNoneOption) {
          options.push({
            id: '0',
            label: config.noneOptionLabel || 'Aucun de ces choix',
            value: null,
          })
        }
      }
    }

    return options
  }

  private formatDynamicOption(item: any, template?: string): string {
    if (!template) {
      return `${item.nomRaisonSociale || item.name} - ${item.centre || item.location}`
    }
    return this.interpolateString(template, item)
  }

  private handleTooManyOptions(config: Record<string, any>, context: WorkflowContext): StepResult {
    return {
      action: 'transition',
      nextStep: config.overflowStep || 'collect_name',
      messageKey: config.overflowMessageKey,
      shouldProcessNext: true,
    }
  }

  private processUserChoice(
    config: Record<string, any>,
    context: WorkflowContext,
    userInput: string,
    stepDefinition: WorkflowStepDefinition
  ): StepResult {
    const availableOptions = context.variables.current_menu_options || []
    const selectedOption = availableOptions.find((opt: MenuOption) => opt.id === userInput.trim())

    if (!selectedOption) {
      return {
        action: 'validation_error',
        error: 'Option invalide. Veuillez choisir une option proposée.',
        menuOptions: availableOptions,
      }
    }

    if (selectedOption.id === '0' || selectedOption.value === null) {
      return {
        action: 'transition',
        nextStep: config.noneOptionStep || stepDefinition.nextStep,
        shouldProcessNext: true,
      }
    }

    // Gestion spéciale pour l'overflow
    if (selectedOption.value === config.overflowValue) {
      // Pour overflow, on retourne vers collect_name par défaut
      const fallbackStep =
        typeof stepDefinition.nextStep === 'string' ? stepDefinition.nextStep : 'collect_name'

      return {
        action: 'transition',
        nextStep: fallbackStep,
        saveData: {
          [config.saveAs || 'selected_option']: selectedOption.value,
        },
        shouldProcessNext: true,
      }
    }

    const saveKey = config.saveAs || 'selected_option'
    const saveData = {
      [saveKey]: selectedOption.value, // ✅ Sauvegarde l'objet complet, pas l'ID
      selected_option_id: selectedOption.id,
    }

    return {
      action: 'transition',
      saveData,
      shouldProcessNext: true,
    }
  }

  public validateConfig(config: Record<string, any>): { valid: boolean; error?: string } {
    if (!config.messageKey) {
      return { valid: false, error: 'MenuStep requires messageKey' }
    }
    if (!config.options && !config.dynamicSource) {
      return { valid: false, error: 'MenuStep requires either options or dynamicSource' }
    }
    return { valid: true }
  }
}
