import { BaseWorkflow } from '../base/base_workflow.js'
import type {
  WorkflowDefinition,
  WorkflowStep,
  StepResult,
  WorkflowContext,
  WorkflowChoice,
} from '#bot/contracts/workflow.contract'
import { WorkflowType, WorkflowPriority } from '#bot/contracts/workflow.contract'

export class NIUPhysicalProWorkflow extends BaseWorkflow {
  getDefinition(): WorkflowDefinition {
    return {
      id: 'niu_physical_pro',
      type: WorkflowType.USER,
      priority: WorkflowPriority.NORMAL,
      version: '1.0.0',

      name: (language) => this.i18n.t('workflows.niu_physical_pro.name', {}, language),
      description: (language) =>
        this.i18n.t('workflows.niu_physical_pro.description', {}, language),

      steps: [
        {
          id: 'full_name',
          type: 'input',
          prompt: 'workflows.niu_physical_pro.full_name_prompt',
          validation: { required: true, min: 2, max: 100 },
        },

        {
          id: 'gender',
          type: 'choice',
          prompt: 'workflows.niu_physical_pro.gender_prompt',
          choices: [
            { id: 'M', value: 'M', label: 'workflows.niu_physical_pro.gender_male' },
            { id: 'F', value: 'F', label: 'workflows.niu_physical_pro.gender_female' },
          ],
          validation: { required: true },
        },

        {
          id: 'marital_status',
          type: 'choice',
          prompt: 'workflows.niu_physical_pro.marital_status_prompt',
          choices: [
            { id: 'single', value: 'single', label: 'workflows.niu_physical_pro.marital_single' },
            {
              id: 'married',
              value: 'married',
              label: 'workflows.niu_physical_pro.marital_married',
            },
            {
              id: 'widowed',
              value: 'widowed',
              label: 'workflows.niu_physical_pro.marital_widowed',
            },
            {
              id: 'divorced',
              value: 'divorced',
              label: 'workflows.niu_physical_pro.marital_divorced',
            },
          ],
          validation: { required: true },
        },

        {
          id: 'birth_date',
          type: 'input',
          prompt: 'workflows.niu_physical_pro.birth_date_prompt',
          validation: {
            required: true,
            pattern: /^\d{2}\/\d{2}\/\d{4}$/,
            custom: (value, context) => {
              if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
                return this.i18n.t(
                  'workflows.niu_physical_pro.validation.invalid_date_format',
                  {},
                  context.session.language
                )
              }
              return true
            },
          },
        },

        {
          id: 'nationality',
          type: 'input',
          prompt: 'workflows.niu_physical_pro.nationality_prompt',
          validation: { required: true, min: 2, max: 50 },
        },

        {
          id: 'activity_sector',
          type: 'choice',
          prompt: 'workflows.niu_physical_pro.activity_sector_prompt',
          choices: [
            { id: 'formal', value: 'formal', label: 'workflows.niu_physical_pro.sector_formal' },
            {
              id: 'informal',
              value: 'informal',
              label: 'workflows.niu_physical_pro.sector_informal',
            },
          ],
          validation: { required: true },
        },

        {
          id: 'activity_category',
          type: 'choice',
          prompt: 'workflows.niu_physical_pro.activity_category_prompt',
          choices: (context) => {
            const sector = context.get('activity_sector')
            return sector === 'formal' ? this.getFormalCategories() : this.getInformalCategories()
          },
          validation: { required: true },
        },

        {
          id: 'zone_type',
          type: 'choice',
          prompt: 'workflows.niu_physical_pro.zone_type_prompt',
          choices: [
            { id: 'urban', value: 'urban', label: 'workflows.niu_physical_pro.zone_urban' },
            { id: 'rural', value: 'rural', label: 'workflows.niu_physical_pro.zone_rural' },
          ],
          validation: { required: true },
        },

        {
          id: 'location',
          type: 'input',
          prompt: (context) => {
            const zoneType = context.get('zone_type')
            const key =
              zoneType === 'urban'
                ? 'workflows.niu_physical_pro.city_prompt'
                : 'workflows.niu_physical_pro.region_prompt'
            return this.i18n.t(key, {}, context.session.language)
          },
          validation: { required: true, min: 2, max: 50 },
        },

        {
          id: 'area',
          type: 'input',
          prompt: (context) => {
            const zoneType = context.get('zone_type')
            const key =
              zoneType === 'urban'
                ? 'workflows.niu_physical_pro.neighborhood_prompt'
                : 'workflows.niu_physical_pro.village_prompt'
            return this.i18n.t(key, {}, context.session.language)
          },
          validation: { required: true, min: 2, max: 100 },
        },

        {
          id: 'geolocation',
          type: 'input',
          prompt: 'workflows.niu_physical_pro.geolocation_prompt',
          validation: {
            required: false,
            custom: (value, context) => {
              const trimmed = value.trim().toUpperCase()
              if (trimmed === 'N/A' || trimmed === '') {
                return true
              }
              if (!/^-?\d+\.?\d*,-?\d+\.?\d*$/.test(trimmed)) {
                return this.i18n.t(
                  'workflows.niu_physical_pro.validation.invalid_coordinates',
                  {},
                  context.session.language
                )
              }
              return true
            },
          },
        },

        {
          id: 'confirmation',
          type: 'choice',
          prompt: (context) => this.buildConfirmationSummary(context),
          choices: [
            {
              id: 'confirm',
              value: 'confirm',
              label: 'workflows.niu_physical_pro.confirm_and_pay',
            },
            { id: 'restart', value: 'restart', label: 'workflows.niu_physical_pro.restart' },
          ],
          validation: { required: true },
        },

        {
          id: 'save_request',
          type: 'service',
          service: {
            name: 'niu_request_service',
            method: 'saveNIURequest',
            params: (context) => this.buildRequestData(context),
          },
        },
      ],

      config: {
        allowInterruption: true,
        saveProgress: true,
        timeout: 600000,
      },
    }
  }

  // Catégories secteur formel (identiques à IGS)
  private getFormalCategories(): WorkflowChoice[] {
    return [
      {
        id: 'public_employee',
        value: 'public_employee',
        label: 'workflows.niu_physical_pro.category_formal_1',
      },
      {
        id: 'private_employee',
        value: 'private_employee',
        label: 'workflows.niu_physical_pro.category_formal_2',
      },
      {
        id: 'international_agent',
        value: 'international_agent',
        label: 'workflows.niu_physical_pro.category_formal_3',
      },
      {
        id: 'liberal_profession',
        value: 'liberal_profession',
        label: 'workflows.niu_physical_pro.category_formal_4',
      },
      {
        id: 'executive',
        value: 'executive',
        label: 'workflows.niu_physical_pro.category_formal_5',
      },
    ]
  }

  // Catégories secteur informel (identiques à IGS)
  private getInformalCategories(): WorkflowChoice[] {
    return [
      {
        id: 'commerce',
        value: 'commerce',
        label: 'workflows.niu_physical_pro.category_informal_1',
      },
      {
        id: 'artisanat',
        value: 'artisanat',
        label: 'workflows.niu_physical_pro.category_informal_2',
      },
      {
        id: 'agriculture',
        value: 'agriculture',
        label: 'workflows.niu_physical_pro.category_informal_3',
      },
      {
        id: 'transport',
        value: 'transport',
        label: 'workflows.niu_physical_pro.category_informal_4',
      },
      {
        id: 'personal_services',
        value: 'personal_services',
        label: 'workflows.niu_physical_pro.category_informal_5',
      },
      {
        id: 'restauration',
        value: 'restauration',
        label: 'workflows.niu_physical_pro.category_informal_6',
      },
      {
        id: 'technical_services',
        value: 'technical_services',
        label: 'workflows.niu_physical_pro.category_informal_7',
      },
      {
        id: 'other_activities',
        value: 'other_activities',
        label: 'workflows.niu_physical_pro.category_informal_8',
      },
    ]
  }

  private buildConfirmationSummary(context: WorkflowContext): string {
    const language = context.session.language

    let summary =
      this.i18n.t('workflows.niu_physical_pro.confirmation_header', {}, language) + '\n\n'

    summary += `📋 ${this.i18n.t('workflows.niu_physical_pro.summary_name', {}, language)}: ${context.get('full_name')}\n`
    summary += `👤 ${this.i18n.t('workflows.niu_physical_pro.summary_gender', {}, language)}: ${this.i18n.t(`workflows.niu_physical_pro.gender_${context.get('gender').toLowerCase()}`, {}, language)}\n`
    summary += `💍 ${this.i18n.t('workflows.niu_physical_pro.summary_marital', {}, language)}: ${this.i18n.t(`workflows.niu_physical_pro.marital_${context.get('marital_status')}`, {}, language)}\n`
    summary += `📅 ${this.i18n.t('workflows.niu_physical_pro.summary_birth_date', {}, language)}: ${context.get('birth_date')}\n`
    summary += `🌍 ${this.i18n.t('workflows.niu_physical_pro.summary_nationality', {}, language)}: ${context.get('nationality')}\n`

    // Informations professionnelles
    summary += `\n💼 ${this.i18n.t('workflows.niu_physical_pro.summary_professional', {}, language)}:\n`
    summary += `📊 ${this.i18n.t('workflows.niu_physical_pro.summary_sector', {}, language)}: ${this.i18n.t(`workflows.niu_physical_pro.sector_${context.get('activity_sector')}`, {}, language)}\n`
    summary += `🏷️ ${this.i18n.t('workflows.niu_physical_pro.summary_category', {}, language)}: ${this.i18n.t(`workflows.niu_physical_pro.category_${context.get('activity_sector')}_${context.get('activity_category')}`, {}, language)}\n`

    const zoneType = context.get('zone_type')
    const locationLabel = zoneType === 'urban' ? 'ville' : 'région'
    const areaLabel = zoneType === 'urban' ? 'quartier' : 'village'

    summary += `\n🏠 ${this.i18n.t('workflows.niu_physical_pro.summary_address', {}, language)}:\n`
    summary += `📍 ${this.i18n.t(`workflows.niu_physical_pro.summary_${locationLabel}`, {}, language)}: ${context.get('location')}\n`
    summary += `🏘️ ${this.i18n.t(`workflows.niu_physical_pro.summary_${areaLabel}`, {}, language)}: ${context.get('area')}\n`

    const geolocation = context.get('geolocation')
    if (geolocation && geolocation.toUpperCase() !== 'N/A') {
      summary += `📱 ${this.i18n.t('workflows.niu_physical_pro.summary_gps', {}, language)}: ${geolocation}\n`
    }

    summary +=
      '\n' + this.i18n.t('workflows.niu_physical_pro.payment_notice', { amount: '2000' }, language)

    return summary
  }

  private buildRequestData(context: WorkflowContext): any {
    return {
      userId: context.session.userId,
      requestType: 'physical_pro',
      fullName: context.get('full_name'),
      gender: context.get('gender'),
      maritalStatus: context.get('marital_status'),
      birthDate: context.get('birth_date'),
      nationality: context.get('nationality'),
      activitySector: context.get('activity_sector'),
      activityCategory: context.get('activity_category'),
      zoneType: context.get('zone_type'),
      location: context.get('location'),
      area: context.get('area'),
      geolocation: context.get('geolocation') || null,
      status: 'pending_payment',
      amount: 2000,
    }
  }

  public async executeStep(
    stepId: string,
    input: string,
    context: WorkflowContext
  ): Promise<StepResult> {
    if (stepId === 'confirmation' && input === '2') {
      const definition = this.getDefinition()
      const firstStep = definition.steps[0]

      for (const step of definition.steps) {
        if (step.type === 'input' || step.type === 'choice') {
          context.set(step.id, undefined)
        }
      }

      context.set('current_step', firstStep.id)

      const message = await this.buildStepMessage(firstStep, context)

      return {
        success: true,
        message,
        nextStepId: firstStep.id,
      }
    }

    return super.executeStep(stepId, input, context)
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

    if (step.type === 'choice' && step.choices) {
      const choices = typeof step.choices === 'function' ? step.choices(context) : step.choices

      const choiceText = choices
        .map((choice, index) => {
          const label =
            typeof choice.label === 'function'
              ? choice.label(language)
              : this.i18n.t(choice.label, {}, language)
          return `${index + 1}. ${label}`
        })
        .join('\n')

      prompt = `${prompt}\n\n${choiceText}`
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
    if (step.id === 'save_request') {
      if (result.success) {
        const message = this.messageBuilder.build({
          content: this.i18n.t(
            'workflows.niu_physical_pro.completion_success',
            {
              requestId: result.requestId,
              amount: '2000',
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
          data: result,
        }
      } else {
        const message = this.messageBuilder.build({
          content: this.i18n.t(
            'workflows.niu_physical_pro.completion_error',
            {
              error: result.error,
            },
            context.session.language
          ),
          footer: this.i18n.t('common.footer_options', {}, context.session.language),
          language: context.session.language,
        })

        return {
          success: false,
          completed: true,
          message,
          error: result.error,
        }
      }
    }

    return null
  }
}
