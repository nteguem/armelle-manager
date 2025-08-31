import type { WorkflowDefinition } from '../engine/workflow_context.js'

export const OnboardingWorkflow: WorkflowDefinition = {
  id: 'onboarding',
  name: 'Configuration utilisateur',
  startStep: 'collect_name',
  metadata: {
    totalSteps: 2,
    headerPrefix: 'Inscription',
    completionMessage: 'workflows.onboarding.complete',
  },

  steps: {
    collect_name: {
      id: 'collect_name',
      type: 'input',
      config: {
        messageKey: 'workflows.onboarding.collect_name',
        validation: {
          required: true,
          minLength: 2,
          maxLength: 100,
          type: 'text',
        },
        saveAs: 'user_name',
      },
      nextStep: 'process_registration',
    },

    process_registration: {
      id: 'process_registration',
      type: 'service',
      config: {
        messageKey: 'workflows.onboarding.searching_dgi',
        service: 'onboarding_service',
        method: 'processUserRegistration',
        params: {
          botUserId: '{{session.userId}}',
          userName: '{{user_name}}',
        },
        saveAs: 'registration_result',
      },
      nextStep: 'finalize',
    },

    finalize: {
      id: 'finalize',
      type: 'message',
      config: {
        messageKey: 'workflows.onboarding.complete',
      },
    },
  },
}

export const OnboardingProgressConfig = {
  totalSteps: 2,
  prefix: 'Inscription',
  stepMapping: {
    collect_name: 1,
    process_registration: 2,
    finalize: 2,
  },
}
