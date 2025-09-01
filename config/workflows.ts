import type { WorkflowProgressConfig } from '#bot/core/workflow/engine/workflow_context'

export const WorkflowProgressConfigs: Record<string, WorkflowProgressConfig> = {
  onboarding: {
    totalSteps: 2,
    prefix: 'Inscription',
    stepMapping: {
      collect_name: 1,
      process_registration: 2,
    },
  },
}
