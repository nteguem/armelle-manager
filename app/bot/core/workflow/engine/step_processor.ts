import type { WorkflowStepDefinition, WorkflowContext, StepResult } from './workflow_context.js'
import { StepRegistry } from '../registry/step_registry.js'
import logger from '@adonisjs/core/services/logger'

/**
 * Processeur d'étapes de workflow
 * Délègue l'exécution aux step handlers spécialisés
 */
export class StepProcessor {
  private stepRegistry: StepRegistry

  constructor() {
    this.stepRegistry = StepRegistry.getInstance()
  }

  /**
   * Traite une étape selon son type
   */
  public async process(
    stepDefinition: WorkflowStepDefinition,
    workflowContext: WorkflowContext,
    userInput?: string
  ): Promise<StepResult> {
    logger.debug(`Processing step type: ${stepDefinition.type}`)

    // Récupérer handler pour ce type d'étape
    const stepHandler = this.stepRegistry.getHandler(stepDefinition.type)
    if (!stepHandler) {
      throw new Error(`No handler found for step type: ${stepDefinition.type}`)
    }

    try {
      // Déléguer traitement au handler spécialisé
      const result = await stepHandler.execute(stepDefinition, workflowContext, userInput)

      logger.debug(`Step processed successfully: ${stepDefinition.type} -> ${result.action}`)

      return result
    } catch (error) {
      logger.error(`Step processing failed: ${stepDefinition.type}`, error)

      return {
        action: 'validation_error',
        error: error.message || "Erreur lors du traitement de l'étape",
      }
    }
  }

  /**
   * Valide qu'une étape peut être traitée
   */
  public canProcess(stepType: string): boolean {
    return this.stepRegistry.hasHandler(stepType)
  }

  /**
   * Liste les types d'étapes supportés
   */
  public getSupportedStepTypes(): string[] {
    return this.stepRegistry.getRegisteredTypes()
  }
}
