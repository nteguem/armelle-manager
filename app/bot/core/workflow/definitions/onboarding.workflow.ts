import { BaseWorkflow } from './base_workflow.js'
import type { WorkflowDefinition } from '../../../types/workflow_types.js'

export class OnboardingWorkflow extends BaseWorkflow {
  define(): WorkflowDefinition {
    return {
      id: 'onboarding',
      version: '1.0.0',
      steps: [
        // Étape 1: Collecte du nom
        {
          id: 'collect_name',
          type: 'input',
          prompt: 'workflows.onboarding.collect_name',
          validation: {
            required: true,
            min: 2,
            max: 100,
          },
          canGoBack: false,
        },
        // Étape 2: Recherche DGI (avec message de transition)
        {
          id: 'process_dgi',
          type: 'service',
          prompt: 'workflows.onboarding.searching_dgi', // Message montré pendant la recherche
          service: {
            name: 'onboarding_service',
            method: 'processDGISearch',
          },
        },
        // Étape 3: Sélection du contribuable (dynamique)
        {
          id: 'taxpayer_selection',
          type: 'choice',
          prompt: 'dynamic', // Sera défini dynamiquement
          choices: [], // Sera rempli dynamiquement
        },
        // Étape 4: Confirmation et création du profil
        {
          id: 'confirm_selection',
          type: 'service',
          prompt: '',
          service: {
            name: 'onboarding_service',
            method: 'confirmTaxpayerSelection',
          },
        },
      ],
      onComplete: async (data: Record<string, any>) => {
        console.log('✅ Onboarding terminé:', data.profileType, data.userName)
      },
    }
  }
}
