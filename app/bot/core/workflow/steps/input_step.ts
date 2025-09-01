import type {
  WorkflowStepDefinition,
  WorkflowContext,
  StepResult,
} from '../engine/workflow_context.js'
import { BaseStep } from './base_step.js'

export class InputStep extends BaseStep {
  readonly type = 'input'

  public async execute(
    stepDefinition: WorkflowStepDefinition,
    context: WorkflowContext,
    userInput?: string
  ): Promise<StepResult> {
    const config = stepDefinition.config

    if (!userInput) {
      return {
        action: 'send_message',
        messageKey: config.messageKey,
        content: config.content,
      }
    }

    if (config.validation) {
      const validation = this.validateInput(userInput, config.validation)
      if (!validation.valid) {
        return {
          action: 'validation_error',
          error: validation.error || 'Erreur de validation',
          messageKey: config.messageKey,
          content: config.content,
        }
      }
    }

    // Convention générique : si config.updateUserName = true, mettre à jour le nom
    if (config.updateUserName === true) {
      const botUserServiceModule = await import('#services/bot_user_service')
      const BotUserService = botUserServiceModule.default
      const botUserService = new BotUserService()
      await botUserService.updateFullName(context.session.userId, userInput.trim())
    }

    const saveKey = config.saveAs || 'input_value'
    const saveData = {
      [saveKey]: userInput.trim(),
      last_input: userInput.trim(),
    }

    return {
      action: 'transition',
      saveData,
      shouldProcessNext: true,
    }
  }

  public validateConfig(config: Record<string, any>): { valid: boolean; error?: string } {
    if (!config.messageKey && !config.content) {
      return { valid: false, error: 'InputStep requires messageKey or content' }
    }
    return { valid: true }
  }
}
