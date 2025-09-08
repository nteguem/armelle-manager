import { BaseWorkflow } from '../base/base_workflow.js'
import type {
  WorkflowDefinition,
  WorkflowStep,
  StepResult,
  WorkflowContext,
} from '#bot/contracts/workflow.contract'
import { WorkflowType, WorkflowPriority } from '#bot/contracts/workflow.contract'
import { SupportedLanguage } from '#bot/types/bot_types'

export class NIUFinderWorkflow extends BaseWorkflow {
  getDefinition(): WorkflowDefinition {
    return {
      id: 'niu_finder',
      type: WorkflowType.USER,
      priority: WorkflowPriority.NORMAL,
      version: '1.0.0',

      name: (language) => this.i18n.t('workflows.niu_finder.name', {}, language),
      description: (language) => this.i18n.t('workflows.niu_finder.description', {}, language),

      steps: [
        // Étape 1: Collecte du nom
        {
          id: 'collect_name',
          type: 'input',
          prompt: 'workflows.niu_finder.name_prompt',
          validation: {
            required: true,
            min: 2,
            max: 100,
            custom: (value, context) => {
              if (value.trim().length < 2) {
                return this.i18n.t(
                  'workflows.niu_finder.validation.name_too_short',
                  {},
                  context.session.language
                )
              }
              return true
            },
          },
          canGoBack: false,
        },

        // Étape 2: Recherche DGI (service automatique)
        {
          id: 'search_dgi',
          type: 'service',
          service: {
            name: 'niu_finder_service',
            method: 'searchNIU',
            params: (context) => ({
              name: context.get('collect_name'),
            }),
          },
        },
      ],

      config: {
        allowInterruption: true,
        saveProgress: false,
        timeout: 180000, // 3 minutes
      },
    }
  }

  public async executeStep(
    stepId: string,
    input: string,
    context: WorkflowContext
  ): Promise<StepResult> {
    // Gestion spéciale pour "*" - retour à la recherche NIU
    if (input === '*') {
      return this.handleReturnToSearch(context)
    }

    return super.executeStep(stepId, input, context)
  }

  /**
   * Gère le retour à la recherche NIU avec "*"
   */
  private async handleReturnToSearch(context: WorkflowContext): Promise<StepResult> {
    // Nettoyer les données de recherche précédente
    context.set('collect_name', undefined)
    context.set('search_dgi', undefined)

    // Retourner à la première étape
    const firstStep = this.getDefinition().steps[0]

    const contextImpl = context as any
    contextImpl.setCurrentStep(firstStep.id)

    const message = await this.buildStepMessage(firstStep, context)

    return {
      success: true,
      message,
      nextStepId: firstStep.id,
    }
  }

  private async buildStepMessage(step: WorkflowStep, context: WorkflowContext): Promise<string> {
    const language = context.session.language

    let prompt = ''
    if (step.prompt) {
      prompt =
        typeof step.prompt === 'function'
          ? step.prompt(context)
          : this.i18n.t(step.prompt, context.state.data, language)
    }

    return this.messageBuilder.build({
      content: prompt,
      language,
      footer: this.i18n.t('common.footer.workflow_navigation', {}, language),
    })
  }

  protected async processServiceResult(
    step: WorkflowStep,
    result: any,
    context: WorkflowContext
  ): Promise<StepResult | null> {
    if (step.id === 'search_dgi') {
      return this.handleSearchResults(result, context)
    }

    return null
  }

  /**
   * Traite les résultats de recherche NIU avec footer spécialisé
   */
  private async handleSearchResults(result: any, context: WorkflowContext): Promise<StepResult> {
    const language = context.session.language
    let finalMessage = ''

    // Cas 1: Erreur DGI ou technique
    if (result.error || !result.success) {
      finalMessage = this.i18n.t(
        'workflows.niu_finder.search_error',
        {
          message: result.message || 'Erreur technique',
        },
        language
      )

      const message = this.messageBuilder.build({
        content: finalMessage,
        footer: this.buildNIUFooter(language),
        language: language,
      })

      return {
        success: false,
        completed: true,
        message,
        error: result.message,
      }
    }

    // Cas 2: Aucun résultat trouvé
    if (result.count === 0) {
      finalMessage = this.i18n.t(
        'workflows.niu_finder.no_results',
        {
          name: context.get('collect_name'),
        },
        language
      )

      const message = this.messageBuilder.build({
        content: finalMessage,
        footer: this.buildNIUFooter(language),
        language: language,
      })

      return {
        success: true,
        completed: true,
        message,
        data: result,
      }
    }

    // Cas 3: Trop de résultats (>20)
    if (result.count > 20) {
      finalMessage = this.i18n.t(
        'workflows.niu_finder.too_many_results',
        {
          count: result.count,
          name: context.get('collect_name'),
        },
        language
      )

      const message = this.messageBuilder.build({
        content: finalMessage,
        footer: this.buildNIUFooter(language),
        language: language,
      })

      return {
        success: true,
        completed: true,
        message,
        data: result,
      }
    }

    // Cas 4: Un seul résultat
    if (result.count === 1) {
      const taxpayer = result.taxpayers[0]
      finalMessage = this.i18n.t(
        'workflows.niu_finder.single_result_final',
        {
          name: taxpayer.nomRaisonSociale,
          niu: taxpayer.niu,
          centre: taxpayer.centre || 'Non spécifié',
        },
        language
      )

      const message = this.messageBuilder.build({
        content: finalMessage,
        footer: this.buildNIUFooter(language),
        language: language,
      })

      return {
        success: true,
        completed: true,
        message,
        data: result,
      }
    }

    // Cas 5: Plusieurs résultats (2-20)
    finalMessage =
      this.i18n.t(
        'workflows.niu_finder.multiple_results',
        {
          count: result.count,
        },
        language
      ) + '\n\n'

    result.taxpayers.forEach((taxpayer: any, index: number) => {
      finalMessage += `${index + 1}. ${taxpayer.nomRaisonSociale} - ${taxpayer.niu}`
      if (taxpayer.centre) {
        finalMessage += ` - ${taxpayer.centre}`
      }
      finalMessage += '\n'
    })

    const message = this.messageBuilder.build({
      content: finalMessage,
      footer: this.buildNIUFooter(language),
      language: language,
    })

    return {
      success: true,
      completed: true,
      message,
      data: result,
    }
  }

  /**
   * Construit le footer spécialisé pour la recherche NIU
   */
  private buildNIUFooter(language: SupportedLanguage): string {
    return this.i18n.t('workflows.niu_finder.footer', {}, language)
  }
}
