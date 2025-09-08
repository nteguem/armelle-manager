import { BaseWorkflow } from '../base/base_workflow.js'
import type {
  WorkflowDefinition,
  WorkflowStep,
  StepResult,
  WorkflowContext,
} from '#bot/contracts/workflow.contract'
import { WorkflowType, WorkflowPriority } from '#bot/contracts/workflow.contract'

export class NIURequestWorkflow extends BaseWorkflow {
  getDefinition(): WorkflowDefinition {
    return {
      id: 'niu_request',
      type: WorkflowType.USER,
      priority: WorkflowPriority.NORMAL,
      version: '1.0.0',

      name: (language) => this.i18n.t('workflows.niu_request.name', {}, language),
      description: (language) => this.i18n.t('workflows.niu_request.description', {}, language),

      steps: [
        {
          id: 'select_type',
          type: 'choice',
          prompt: 'workflows.niu_request.type_prompt',
          choices: [
            {
              id: 'physical_non_pro',
              value: 'physical_non_pro',
              label: 'workflows.niu_request.type_physical_non_pro',
            },
            {
              id: 'physical_pro',
              value: 'physical_pro',
              label: 'workflows.niu_request.type_physical_pro',
            },
            {
              id: 'morale',
              value: 'morale',
              label: 'workflows.niu_request.type_morale',
            },
          ],
          validation: { required: true },
          canGoBack: false,
        },

        {
          id: 'redirect_to_specific_workflow',
          type: 'service',
          service: {
            name: 'niu_request_service',
            method: 'redirectToSpecificWorkflow',
            params: (context) => ({
              selectedType: context.get('select_type'),
              userId: context.session.userId,
            }),
          },
        },
      ],

      config: {
        allowInterruption: true,
        saveProgress: false,
        timeout: 300000,
      },

      activation: {
        commands: ['niu', 'demande_niu'],
        keywords: ['demande niu', 'identifiant fiscal', 'contribuable'],
      },
    }
  }

  protected async processServiceResult(
    step: WorkflowStep,
    result: any,
    context: WorkflowContext
  ): Promise<StepResult | null> {
    if (step.id === 'redirect_to_specific_workflow') {
      const message = this.messageBuilder.build({
        content: this.i18n.t(
          'workflows.niu_request.redirect_message',
          {
            workflowName: result.workflowName,
          },
          context.session.language
        ),
        footer: this.i18n.t('common.footer_options', {}, context.session.language),
        language: context.session.language,
      })

      return {
        success: true,
        completed: true,
        message,
        data: {
          nextWorkflowType: result.nextWorkflowType,
          workflowName: result.workflowName,
        },
      }
    }

    return null
  }
}
