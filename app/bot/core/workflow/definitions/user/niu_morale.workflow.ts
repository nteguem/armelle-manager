import { BaseWorkflow } from '../base/base_workflow.js'
import type {
  WorkflowDefinition,
  WorkflowStep,
  StepResult,
  WorkflowContext,
} from '#bot/contracts/workflow.contract'
import { WorkflowType, WorkflowPriority } from '#bot/contracts/workflow.contract'

export class NIUMoraleWorkflow extends BaseWorkflow {
  getDefinition(): WorkflowDefinition {
    return {
      id: 'niu_morale',
      type: WorkflowType.USER,
      priority: WorkflowPriority.NORMAL,
      version: '1.0.0',

      name: (language) => this.i18n.t('workflows.niu_morale.name', {}, language),
      description: (language) => this.i18n.t('workflows.niu_morale.description', {}, language),

      steps: [
        {
          id: 'company_name',
          type: 'input',
          prompt: 'workflows.niu_morale.company_name_prompt',
          validation: { required: true, min: 2, max: 100 },
        },

        {
          id: 'company_sigle',
          type: 'input',
          prompt: 'workflows.niu_morale.company_sigle_prompt',
          validation: { required: true, max: 20 },
        },

        {
          id: 'creation_date',
          type: 'input',
          prompt: 'workflows.niu_morale.creation_date_prompt',
          validation: {
            required: true,
            pattern: /^\d{2}\/\d{2}\/\d{4}$/,
            custom: (value, context) => {
              if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
                return this.i18n.t(
                  'workflows.niu_morale.validation.invalid_date_format',
                  {},
                  context.session.language
                )
              }
              return true
            },
          },
        },

        {
          id: 'creation_place',
          type: 'input',
          prompt: 'workflows.niu_morale.creation_place_prompt',
          validation: { required: true, min: 2, max: 50 },
        },

        {
          id: 'legal_form',
          type: 'choice',
          prompt: 'workflows.niu_morale.legal_form_prompt',
          choices: [
            { id: 'sarl', value: 'SARL', label: 'workflows.niu_morale.legal_sarl' },
            { id: 'sa', value: 'SA', label: 'workflows.niu_morale.legal_sa' },
            { id: 'sas', value: 'SAS', label: 'workflows.niu_morale.legal_sas' },
            { id: 'eurl', value: 'EURL', label: 'workflows.niu_morale.legal_eurl' },
            { id: 'gie', value: 'GIE', label: 'workflows.niu_morale.legal_gie' },
            { id: 'other', value: 'Autre', label: 'workflows.niu_morale.legal_other' },
          ],
          validation: { required: true },
        },

        {
          id: 'rccm',
          type: 'input',
          prompt: 'workflows.niu_morale.rccm_prompt',
          validation: { required: true, min: 8, max: 20 },
        },

        {
          id: 'manager_nationality',
          type: 'input',
          prompt: 'workflows.niu_morale.manager_nationality_prompt',
          validation: { required: true, min: 2, max: 50 },
        },

        {
          id: 'manager_name',
          type: 'input',
          prompt: 'workflows.niu_morale.manager_name_prompt',
          validation: { required: true, min: 2, max: 100 },
        },

        {
          id: 'manager_niu',
          type: 'input',
          prompt: 'workflows.niu_morale.manager_niu_prompt',
          validation: {
            required: false,
            custom: (value, context) => {
              const trimmed = value.trim().toUpperCase()
              if (trimmed === 'N/A' || trimmed === '') {
                return true
              }
              if (!/^[A-Z0-9]{12,}$/.test(trimmed)) {
                return this.i18n.t(
                  'workflows.niu_morale.validation.invalid_niu',
                  {},
                  context.session.language
                )
              }
              return true
            },
          },
        },

        {
          id: 'projected_revenue',
          type: 'input',
          prompt: 'workflows.niu_morale.projected_revenue_prompt',
          validation: {
            required: true,
            pattern: /^\d+$/,
            custom: (value, context) => {
              const amount = Number.parseInt(value.replace(/\s/g, ''), 10)
              if (Number.isNaN(amount) || amount < 0) {
                return this.i18n.t(
                  'workflows.niu_morale.validation.invalid_amount',
                  {},
                  context.session.language
                )
              }
              return true
            },
          },
        },

        {
          id: 'employee_count',
          type: 'input',
          prompt: 'workflows.niu_morale.employee_count_prompt',
          validation: {
            required: true,
            pattern: /^\d+$/,
            custom: (value, context) => {
              const count = Number.parseInt(value, 10)
              if (Number.isNaN(count) || count < 0) {
                return this.i18n.t(
                  'workflows.niu_morale.validation.invalid_number',
                  {},
                  context.session.language
                )
              }
              return true
            },
          },
        },

        {
          id: 'capital_amount',
          type: 'input',
          prompt: 'workflows.niu_morale.capital_amount_prompt',
          validation: {
            required: true,
            pattern: /^\d+$/,
            custom: (value, context) => {
              const amount = Number.parseInt(value.replace(/\s/g, ''), 10)
              if (Number.isNaN(amount) || amount < 0) {
                return this.i18n.t(
                  'workflows.niu_morale.validation.invalid_amount',
                  {},
                  context.session.language
                )
              }
              return true
            },
          },
        },

        {
          id: 'has_shareholders',
          type: 'choice',
          prompt: 'workflows.niu_morale.has_shareholders_prompt',
          choices: [
            { id: 'yes', value: true, label: 'workflows.niu_morale.yes' },
            { id: 'no', value: false, label: 'workflows.niu_morale.no' },
          ],
          validation: { required: true },
        },

        {
          id: 'has_board',
          type: 'choice',
          prompt: 'workflows.niu_morale.has_board_prompt',
          choices: [
            { id: 'yes', value: true, label: 'workflows.niu_morale.yes' },
            { id: 'no', value: false, label: 'workflows.niu_morale.no' },
          ],
          validation: { required: true },
        },

        {
          id: 'zone_type',
          type: 'choice',
          prompt: 'workflows.niu_morale.zone_type_prompt',
          choices: [
            { id: 'urban', value: 'urban', label: 'workflows.niu_morale.zone_urban' },
            { id: 'rural', value: 'rural', label: 'workflows.niu_morale.zone_rural' },
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
                ? 'workflows.niu_morale.city_prompt'
                : 'workflows.niu_morale.region_prompt'
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
                ? 'workflows.niu_morale.neighborhood_prompt'
                : 'workflows.niu_morale.village_prompt'
            return this.i18n.t(key, {}, context.session.language)
          },
          validation: { required: true, min: 2, max: 100 },
        },

        {
          id: 'headquarters_status',
          type: 'choice',
          prompt: 'workflows.niu_morale.headquarters_status_prompt',
          choices: [
            { id: 'owner', value: 'owner', label: 'workflows.niu_morale.status_owner' },
            { id: 'tenant', value: 'tenant', label: 'workflows.niu_morale.status_tenant' },
            { id: 'occupant', value: 'occupant', label: 'workflows.niu_morale.status_occupant' },
          ],
          validation: { required: true },
        },

        {
          id: 'geolocation',
          type: 'input',
          prompt: 'workflows.niu_morale.geolocation_prompt',
          validation: {
            required: false,
            custom: (value, context) => {
              const trimmed = value.trim().toUpperCase()
              if (trimmed === 'N/A' || trimmed === '') {
                return true
              }
              if (!/^-?\d+\.?\d*,-?\d+\.?\d*$/.test(trimmed)) {
                return this.i18n.t(
                  'workflows.niu_morale.validation.invalid_coordinates',
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
            { id: 'confirm', value: 'confirm', label: 'workflows.niu_morale.confirm_and_pay' },
            { id: 'restart', value: 'restart', label: 'workflows.niu_morale.restart' },
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

  private buildConfirmationSummary(context: WorkflowContext): string {
    const language = context.session.language

    let summary = this.i18n.t('workflows.niu_morale.confirmation_header', {}, language) + '\n\n'

    // Informations entreprise
    summary += `🏢 ${this.i18n.t('workflows.niu_morale.summary_company', {}, language)}:\n`
    summary += `📋 ${this.i18n.t('workflows.niu_morale.summary_name', {}, language)}: ${context.get('company_name')}\n`
    summary += `🏷️ ${this.i18n.t('workflows.niu_morale.summary_sigle', {}, language)}: ${context.get('company_sigle')}\n`
    summary += `📅 ${this.i18n.t('workflows.niu_morale.summary_creation_date', {}, language)}: ${context.get('creation_date')}\n`
    summary += `📍 ${this.i18n.t('workflows.niu_morale.summary_creation_place', {}, language)}: ${context.get('creation_place')}\n`
    summary += `🏛️ ${this.i18n.t('workflows.niu_morale.summary_legal_form', {}, language)}: ${context.get('legal_form')}\n`
    summary += `📋 ${this.i18n.t('workflows.niu_morale.summary_rccm', {}, language)}: ${context.get('rccm')}\n`

    // Dirigeant
    summary += `\n👨‍💼 ${this.i18n.t('workflows.niu_morale.summary_manager_info', {}, language)}:\n`
    summary += `🌍 ${this.i18n.t('workflows.niu_morale.summary_manager_nationality', {}, language)}: ${context.get('manager_nationality')}\n`
    summary += `📋 ${this.i18n.t('workflows.niu_morale.summary_manager_name', {}, language)}: ${context.get('manager_name')}\n`

    const managerNiu = context.get('manager_niu')
    if (managerNiu && managerNiu.toUpperCase() !== 'N/A') {
      summary += `🆔 ${this.i18n.t('workflows.niu_morale.summary_manager_niu', {}, language)}: ${managerNiu}\n`
    }

    // Informations financières
    summary += `\n💰 ${this.i18n.t('workflows.niu_morale.summary_financial', {}, language)}:\n`
    summary += `📊 ${this.i18n.t('workflows.niu_morale.summary_projected_revenue', {}, language)}: ${Number.parseInt(context.get('projected_revenue')).toLocaleString('fr-FR')} FCFA\n`
    summary += `👥 ${this.i18n.t('workflows.niu_morale.summary_employees', {}, language)}: ${context.get('employee_count')}\n`
    summary += `💎 ${this.i18n.t('workflows.niu_morale.summary_capital', {}, language)}: ${Number.parseInt(context.get('capital_amount')).toLocaleString('fr-FR')} FCFA\n`

    const hasShareholders = context.get('has_shareholders')
    const hasBoard = context.get('has_board')
    summary += `🤝 ${this.i18n.t('workflows.niu_morale.summary_shareholders', {}, language)}: ${this.i18n.t(`workflows.niu_morale.${hasShareholders ? 'yes' : 'no'}`, {}, language)}\n`
    summary += `🏛️ ${this.i18n.t('workflows.niu_morale.summary_board', {}, language)}: ${this.i18n.t(`workflows.niu_morale.${hasBoard ? 'yes' : 'no'}`, {}, language)}\n`

    // Siège social
    const zoneType = context.get('zone_type')
    const locationLabel = zoneType === 'urban' ? 'ville' : 'région'
    const areaLabel = zoneType === 'urban' ? 'quartier' : 'village'

    summary += `\n🏢 ${this.i18n.t('workflows.niu_morale.summary_headquarters', {}, language)}:\n`
    summary += `📍 ${this.i18n.t(`workflows.niu_morale.summary_${locationLabel}`, {}, language)}: ${context.get('location')}\n`
    summary += `🏘️ ${this.i18n.t(`workflows.niu_morale.summary_${areaLabel}`, {}, language)}: ${context.get('area')}\n`
    summary += `🏠 ${this.i18n.t('workflows.niu_morale.summary_status', {}, language)}: ${this.i18n.t(`workflows.niu_morale.status_${context.get('headquarters_status')}`, {}, language)}\n`

    const geolocation = context.get('geolocation')
    if (geolocation && geolocation.toUpperCase() !== 'N/A') {
      summary += `📱 ${this.i18n.t('workflows.niu_morale.summary_gps', {}, language)}: ${geolocation}\n`
    }

    summary +=
      '\n' + this.i18n.t('workflows.niu_morale.payment_notice', { amount: '2000' }, language)

    return summary
  }

  private buildRequestData(context: WorkflowContext): any {
    return {
      userId: context.session.userId,
      requestType: 'morale',
      companyName: context.get('company_name'),
      companySigle: context.get('company_sigle'),
      creationDate: context.get('creation_date'),
      creationPlace: context.get('creation_place'),
      legalForm: context.get('legal_form'),
      rccm: context.get('rccm'),
      managerNationality: context.get('manager_nationality'),
      managerName: context.get('manager_name'),
      managerNiu: context.get('manager_niu') || null,
      projectedRevenue: Number.parseInt(context.get('projected_revenue')),
      employeeCount: Number.parseInt(context.get('employee_count')),
      capitalAmount: Number.parseInt(context.get('capital_amount')),
      hasShareholders: context.get('has_shareholders'),
      hasBoard: context.get('has_board'),
      zoneType: context.get('zone_type'),
      location: context.get('location'),
      area: context.get('area'),
      headquartersStatus: context.get('headquarters_status'),
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
            'workflows.niu_morale.completion_success',
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
            'workflows.niu_morale.completion_error',
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
