import { BaseWorkflow } from '../base/base_workflow.js'
import type {
  WorkflowDefinition,
  WorkflowStep,
  StepResult,
  WorkflowContext,
} from '#bot/contracts/workflow.contract'
import { WorkflowType, WorkflowPriority } from '#bot/contracts/workflow.contract'
import logger from '@adonisjs/core/services/logger'
import { SupportedLanguage } from '#bot/types/bot_types'

export class OnboardingWorkflow extends BaseWorkflow {
  getDefinition(): WorkflowDefinition {
    return {
      id: 'onboarding',
      type: WorkflowType.SYSTEM,
      priority: WorkflowPriority.CRITICAL,
      version: '1.0.0',

      name: (language) => this.i18n.t('workflows.onboarding.name', {}, language),
      description: (language) => this.i18n.t('workflows.onboarding.description', {}, language),

      steps: [
        {
          id: 'collect_name',
          type: 'input',
          prompt: 'workflows.onboarding.collect_name_prompt',
          validation: {
            required: true,
            min: 2,
            max: 100,
          },
          canGoBack: false, // Pas de retour sur première étape
        },

        {
          id: 'save_name',
          type: 'service',
          service: {
            name: 'onboarding_service',
            method: 'saveName',
            params: (context) => ({
              userId: context.session.userId,
              fullName: context.get('collect_name'),
            }),
          },
        },

        {
          id: 'search_dgi',
          type: 'service',
          service: {
            name: 'onboarding_service',
            method: 'searchDGI',
            params: (context) => ({
              name: context.get('collect_name'),
            }),
          },
        },

        {
          id: 'process_selection',
          type: 'choice',
          prompt: (context) => {
            const result = context.get('search_dgi')
            if (result.count === 1) {
              return this.i18n.t(
                'workflows.onboarding.confirm_single',
                {},
                context.session.language
              )
            }
            if (result.count > 10) {
              return this.i18n.t(
                'workflows.onboarding.too_many_results',
                {},
                context.session.language
              )
            }
            return this.i18n.t('workflows.onboarding.select_multiple', {}, context.session.language)
          },
          skipIf: (context) => {
            const result = context.get('search_dgi')
            return !result || result.count === 0 || result.error
          },
          choices: (context) => {
            const result = context.get('search_dgi')

            if (result.count > 10) {
              return [
                {
                  id: 'refine',
                  label: (lang) => this.i18n.t('workflows.onboarding.choice_refine', {}, lang),
                  value: 'refine',
                  next: 'collect_name',
                },
                {
                  id: 'continue',
                  label: (lang) =>
                    this.i18n.t('workflows.onboarding.choice_continue_without', {}, lang),
                  value: null,
                  next: 'finalize',
                },
              ]
            }

            const choices = result.taxpayers.map((t: any, i: number) => ({
              id: `taxpayer_${i}`,
              label: () => `${t.nomRaisonSociale || t.name}${t.centre ? ` - ${t.centre}` : ''}`,
              value: t,
              next: 'link_taxpayer',
            }))

            choices.push({
              id: 'none',
              label: (lang: SupportedLanguage) => {
                if (result.count === 1) {
                  return this.i18n.t('workflows.onboarding.choice_not_me', {}, lang)
                } else {
                  return this.i18n.t('workflows.onboarding.choice_none', {}, lang)
                }
              },
              value: null,
              next: 'finalize',
            })

            return choices
          },
          canGoBack: false, // Pas de retour après recherche DGI
        },

        {
          id: 'link_taxpayer',
          type: 'service',
          skipIf: (context) => !context.get('process_selection'),
          service: {
            name: 'onboarding_service',
            method: 'linkTaxpayer',
            params: (context) => ({
              userId: context.session.userId,
              taxpayerData: context.get('process_selection'),
              userName: context.get('collect_name'),
            }),
          },
        },

        {
          id: 'finalize',
          type: 'service',
          service: {
            name: 'onboarding_service',
            method: 'finalizeOnboarding',
            params: (context) => ({
              userId: context.session.userId,
              hasProfile: !!context.get('link_taxpayer'),
              userName: context.get('collect_name'),
              taxpayerData: context.get('link_taxpayer'),
              searchResult: context.get('search_dgi'),
            }),
          },
        },
      ],

      config: {
        allowInterruption: false,
        saveProgress: false,
        timeout: 300000,
      },
    }
  }

  protected async processServiceResult(
    step: WorkflowStep,
    result: any,
    context: WorkflowContext
  ): Promise<StepResult | null> {
    // Après recherche DGI - skip vers finalize si erreur ou aucun résultat
    if (step.id === 'search_dgi') {
      if (result.error || result.count === 0) {
        logger.info(
          {
            userId: context.session.userId,
            reason: result.error ? 'DGI error' : 'No results',
          },
          'Skipping to finalize'
        )

        return {
          success: true,
          nextStepId: 'finalize',
        }
      }
    }

    // MESSAGE FINAL - C'EST ICI QU'ON GÈRE LES MESSAGES DE FIN
    if (step.id === 'finalize') {
      let messageContent = ''

      // Profil complet avec NIU
      if (result.hasProfile && result.taxpayerData) {
        messageContent = this.i18n.t(
          'workflows.onboarding.complete_full',
          {
            userName: result.userName,
            niu: result.taxpayerData.niu || '',
          },
          context.session.language
        )
      }
      // Erreur DGI
      else if (result.dgiError) {
        messageContent = this.i18n.t(
          'workflows.onboarding.complete_partial_error',
          {
            userName: result.userName,
          },
          context.session.language
        )
      }
      // Aucun profil trouvé
      else {
        messageContent = this.i18n.t(
          'workflows.onboarding.complete_partial',
          {
            userName: result.userName,
          },
          context.session.language
        )
      }

      // Construire le message final avec footer
      const finalMessage = this.messageBuilder.build({
        content: messageContent,
        footer: this.i18n.t('common.footer_options', {}, context.session.language),
        language: context.session.language,
      })

      return {
        success: true,
        completed: true,
        message: finalMessage,
        data: result,
      }
    }

    return null
  }
}
