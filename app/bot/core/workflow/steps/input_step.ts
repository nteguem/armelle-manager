import type {
  WorkflowStepDefinition,
  WorkflowContext,
  StepResult,
} from '../engine/workflow_context.js'
import { BaseStep } from './base_step.js'

/**
 * Étape de saisie utilisateur
 * Config: { messageKey, validation?, saveAs? }
 */
export class InputStep extends BaseStep {
  readonly type = 'input'

  public async execute(
    stepDefinition: WorkflowStepDefinition,
    context: WorkflowContext,
    userInput?: string
  ): Promise<StepResult> {
    const config = stepDefinition.config

    // Pas d'input = afficher prompt
    if (!userInput) {
      return {
        action: 'send_message',
        messageKey: config.messageKey,
        content: config.content,
      }
    }

    // Valider input si règles définies
    if (config.validation) {
      const validation = this.validateInput(userInput, config.validation)
      if (!validation.valid) {
        return {
          action: 'validation_error',
          error: validation.error,
          messageKey: config.messageKey, // Réafficher prompt
          content: config.content,
        }
      }
    }

    // Sauvegarder valeur
    const saveKey = config.saveAs || 'input_value'
    const saveData = {
      [saveKey]: userInput.trim(),
      last_input: userInput.trim(),
    }

    return {
      action: 'transition',
      saveData,
    }
  }

  public validateConfig(config: Record<string, any>): { valid: boolean; error?: string } {
    if (!config.messageKey && !config.content) {
      return { valid: false, error: 'InputStep requires messageKey or content' }
    }
    return { valid: true }
  }
}
