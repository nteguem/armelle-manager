import type {
  WorkflowStepDefinition,
  WorkflowContext,
  StepResult,
} from '../engine/workflow_context.js'
import { BaseStep } from './base_step.js'

/**
 * Étape d'appel de service
 * Config: { service, method, params, messageKey?, saveAs? }
 */
export class ServiceStep extends BaseStep {
  readonly type = 'service'

  public async execute(
    stepDefinition: WorkflowStepDefinition,
    context: WorkflowContext,
    userInput?: string
  ): Promise<StepResult> {
    const config = stepDefinition.config

    // Interpolation spéciale pour objets complets
    const interpolatedParams: Record<string, any> = {}

    for (const [key, value] of Object.entries(config.params || {})) {
      if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
        // Extraire le nom de variable
        const varName = value.slice(2, -2).trim()

        // Récupérer directement la valeur de la variable
        if (varName.includes('.')) {
          interpolatedParams[key] = this.getNestedValue(
            { ...context.variables, session: context.session },
            varName
          )
        } else if (varName === 'session.userId') {
          interpolatedParams[key] = context.session.userId
        } else {
          interpolatedParams[key] = context.variables[varName]
        }
      } else {
        interpolatedParams[key] = value
      }
    }

    const saveData = {
      current_service: config.service,
      current_method: config.method,
    }

    return {
      action: 'call_service',
      serviceCall: {
        service: config.service,
        method: config.method,
        params: interpolatedParams,
      },
      saveData,
      messageKey: config.messageKey,
      saveAs: config.saveAs || 'service_result',
    }
  }

  public validateConfig(config: Record<string, any>): { valid: boolean; error?: string } {
    if (!config.service) {
      return { valid: false, error: 'ServiceStep requires service name' }
    }
    if (!config.method) {
      return { valid: false, error: 'ServiceStep requires method name' }
    }
    return { valid: true }
  }
}
