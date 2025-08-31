import type {
  WorkflowStepDefinition,
  WorkflowContext,
  StepResult,
} from '../engine/workflow_context.js'
import { BaseStep } from './base_step.js'

export class MessageStep extends BaseStep {
  readonly type = 'message'

  public async execute(
    stepDefinition: WorkflowStepDefinition,
    context: WorkflowContext,
    userInput?: string
  ): Promise<StepResult> {
    const config = stepDefinition.config

    return {
      action: 'complete_workflow',
      messageKey: config.messageKey,
      content: config.content,
    }
  }

  public validateConfig(config: Record<string, any>): { valid: boolean; error?: string } {
    if (!config.messageKey && !config.content) {
      return { valid: false, error: 'MessageStep requires messageKey or content' }
    }
    return { valid: true }
  }
}
