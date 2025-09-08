import { BaseWorkflow } from '../base/base_workflow.js'
import type {
  WorkflowDefinition,
  WorkflowStep,
  StepResult,
  WorkflowContext,
  WorkflowChoice,
} from '#bot/contracts/workflow.contract'
import { WorkflowType, WorkflowPriority } from '#bot/contracts/workflow.contract'

export class IGSCalculatorWorkflow extends BaseWorkflow {
  getDefinition(): WorkflowDefinition {
    return {
      id: 'igs_calculator',
      type: WorkflowType.USER,
      priority: WorkflowPriority.NORMAL,
      version: '1.0.0',

      name: (language) => this.i18n.t('workflows.igs_calculator.name', {}, language),
      description: (language) => this.i18n.t('workflows.igs_calculator.description', {}, language),

      steps: [
        {
          id: 'sector_selection',
          type: 'choice',
          prompt: 'workflows.igs_calculator.sector_prompt',
          choices: [
            { id: 'formal', value: 'formal', label: 'workflows.igs_calculator.sector_formal' },
            {
              id: 'informal',
              value: 'informal',
              label: 'workflows.igs_calculator.sector_informal',
            },
          ],
          validation: {
            required: true,
          },
        },

        {
          id: 'subcategory_selection',
          type: 'choice',
          prompt: (context) => {
            const sector = context.get('sector_selection')
            return sector === 'formal'
              ? this.i18n.t(
                  'workflows.igs_calculator.subcategory_formal_prompt',
                  {},
                  context.session.language
                )
              : this.i18n.t(
                  'workflows.igs_calculator.subcategory_informal_prompt',
                  {},
                  context.session.language
                )
          },
          choices: (context) => {
            const sector = context.get('sector_selection')
            return sector === 'formal'
              ? this.getFormalSubcategories()
              : this.getInformalSubcategories()
          },
          validation: {
            required: true,
          },
        },

        {
          id: 'previous_year_revenue',
          type: 'input',
          prompt: 'workflows.igs_calculator.previous_revenue_prompt',
          validation: {
            required: true,
            custom: (value, context) => this.validateRevenue(value, context),
          },
        },

        {
          id: 'current_year_estimate',
          type: 'input',
          prompt: 'workflows.igs_calculator.current_revenue_prompt',
          validation: {
            required: true,
            custom: (value, context) => this.validateRevenue(value, context),
          },
        },

        {
          id: 'company_type',
          type: 'choice',
          prompt: 'workflows.igs_calculator.company_type_prompt',
          choices: [
            {
              id: 'legal_entity',
              value: 'legal_entity',
              label: 'workflows.igs_calculator.legal_entity',
            },
            { id: 'individual', value: 'individual', label: 'workflows.igs_calculator.individual' },
          ],
          validation: {
            required: true,
          },
        },

        {
          id: 'company_name',
          type: 'input',
          prompt: 'workflows.igs_calculator.name_prompt',
          validation: {
            required: true,
            custom: (value, context) => {
              if (value.trim() === '') {
                return this.i18n.t(
                  'workflows.igs_calculator.validation.name_required',
                  {},
                  context.session.language
                )
              }
              return true
            },
          },
        },

        {
          id: 'phone_number',
          type: 'input',
          prompt: 'workflows.igs_calculator.phone_prompt',
          validation: {
            required: true,
            custom: (value, context) => this.validateCameroonianPhone(value, context),
          },
        },

        {
          id: 'city_selection',
          type: 'choice',
          prompt: 'workflows.igs_calculator.city_prompt',
          choices: () => this.getCityChoices(),
          validation: {
            required: true,
          },
        },

        {
          id: 'neighborhood_input',
          type: 'input',
          prompt: (context) => {
            const city = context.get('city_selection')
            return city === 'other'
              ? this.i18n.t(
                  'workflows.igs_calculator.other_city_prompt',
                  {},
                  context.session.language
                )
              : this.i18n.t(
                  'workflows.igs_calculator.neighborhood_prompt',
                  {},
                  context.session.language
                )
          },
          validation: {
            required: true,
            custom: (value, context) => {
              if (value.trim() === '') {
                return this.i18n.t(
                  'workflows.igs_calculator.validation.field_required',
                  {},
                  context.session.language
                )
              }
              return true
            },
          },
        },

        {
          id: 'niu_input',
          type: 'input',
          prompt: 'workflows.igs_calculator.niu_prompt',
          validation: {
            required: true,
            custom: (value, context) => this.validateNIU(value, context),
          },
        },

        {
          id: 'confirmation',
          type: 'choice',
          prompt: (context) => this.buildConfirmationSummary(context),
          choices: [
            { id: 'confirm', value: 'confirm', label: 'workflows.igs_calculator.confirm' },
            { id: 'restart', value: 'restart', label: 'workflows.igs_calculator.restart' },
          ],
          validation: {
            required: true,
          },
        },

        {
          id: 'save_company',
          type: 'service',
          service: {
            name: 'igs_service',
            method: 'saveCompanyData',
            params: (context) => this.buildCompanyData(context),
          },
        },
      ],

      config: {
        allowInterruption: true,
        saveProgress: true,
        timeout: 300000, // 5 minutes
      },
    }
  }

  private getFormalSubcategories(): WorkflowChoice[] {
    return [
      {
        id: 'public_employee',
        value: 'public_employee',
        label: 'workflows.igs_calculator.subcategory_formal_1',
      },
      {
        id: 'private_employee',
        value: 'private_employee',
        label: 'workflows.igs_calculator.subcategory_formal_2',
      },
      {
        id: 'international_agent',
        value: 'international_agent',
        label: 'workflows.igs_calculator.subcategory_formal_3',
      },
      {
        id: 'liberal_profession',
        value: 'liberal_profession',
        label: 'workflows.igs_calculator.subcategory_formal_4',
      },
      {
        id: 'executive',
        value: 'executive',
        label: 'workflows.igs_calculator.subcategory_formal_5',
      },
    ]
  }

  private getInformalSubcategories(): WorkflowChoice[] {
    return [
      {
        id: 'commerce',
        value: 'commerce',
        label: 'workflows.igs_calculator.subcategory_informal_1',
      },
      {
        id: 'artisanat',
        value: 'artisanat',
        label: 'workflows.igs_calculator.subcategory_informal_2',
      },
      {
        id: 'agriculture',
        value: 'agriculture',
        label: 'workflows.igs_calculator.subcategory_informal_3',
      },
      {
        id: 'transport',
        value: 'transport',
        label: 'workflows.igs_calculator.subcategory_informal_4',
      },
      {
        id: 'personal_services',
        value: 'personal_services',
        label: 'workflows.igs_calculator.subcategory_informal_5',
      },
      {
        id: 'restauration',
        value: 'restauration',
        label: 'workflows.igs_calculator.subcategory_informal_6',
      },
      {
        id: 'technical_services',
        value: 'technical_services',
        label: 'workflows.igs_calculator.subcategory_informal_7',
      },
      {
        id: 'other_activities',
        value: 'other_activities',
        label: 'workflows.igs_calculator.subcategory_informal_8',
      },
    ]
  }

  private getCityChoices(): WorkflowChoice[] {
    return [
      { id: 'yaounde', value: 'yaounde', label: 'workflows.igs_calculator.city_yaounde' },
      { id: 'douala', value: 'douala', label: 'workflows.igs_calculator.city_douala' },
      { id: 'bafoussam', value: 'bafoussam', label: 'workflows.igs_calculator.city_bafoussam' },
      { id: 'garoua', value: 'garoua', label: 'workflows.igs_calculator.city_garoua' },
      { id: 'bamenda', value: 'bamenda', label: 'workflows.igs_calculator.city_bamenda' },
      { id: 'maroua', value: 'maroua', label: 'workflows.igs_calculator.city_maroua' },
      { id: 'ngaoundere', value: 'ngaoundere', label: 'workflows.igs_calculator.city_ngaoundere' },
      { id: 'bertoua', value: 'bertoua', label: 'workflows.igs_calculator.city_bertoua' },
      { id: 'buea', value: 'buea', label: 'workflows.igs_calculator.city_buea' },
      { id: 'ebolowa', value: 'ebolowa', label: 'workflows.igs_calculator.city_ebolowa' },
      { id: 'other', value: 'other', label: 'workflows.igs_calculator.city_other' },
    ]
  }

  private validateRevenue(value: string, context: WorkflowContext): boolean | string {
    const cleanValue = value.replace(/\s/g, '')

    if (!/^\d+$/.test(cleanValue)) {
      return this.i18n.t(
        'workflows.igs_calculator.validation.invalid_amount',
        {},
        context.session.language
      )
    }

    const amount = Number.parseInt(cleanValue, 10)
    if (Number.isNaN(amount) || amount < 0) {
      return this.i18n.t(
        'workflows.igs_calculator.validation.invalid_amount',
        {},
        context.session.language
      )
    }

    return true
  }

  private validateCameroonianPhone(value: string, context: WorkflowContext): boolean | string {
    const cleanPhone = value.replace(/\D/g, '')

    if (!/^(6|2|3|8|9)\d{8}$/.test(cleanPhone)) {
      return this.i18n.t(
        'workflows.igs_calculator.validation.invalid_phone',
        {},
        context.session.language
      )
    }

    return true
  }

  private validateNIU(value: string, context: WorkflowContext): boolean | string {
    const cleanValue = value.trim().toUpperCase()

    if (cleanValue !== 'N/A' && !/^[A-Z0-9]{12,}$/.test(cleanValue)) {
      return this.i18n.t(
        'workflows.igs_calculator.validation.invalid_niu',
        {},
        context.session.language
      )
    }

    return true
  }

  private buildConfirmationSummary(context: WorkflowContext): string {
    const data = {
      sector: this.i18n.t(
        `workflows.igs_calculator.sector_${context.get('sector_selection')}`,
        {},
        context.session.language
      ),
      subcategory: this.i18n.t(
        `workflows.igs_calculator.subcategory_${context.get('sector_selection')}_${context.get('subcategory_selection')}`,
        {},
        context.session.language
      ),
      previousRevenue: Number.parseInt(context.get('previous_year_revenue')).toLocaleString(
        'fr-FR'
      ),
      currentRevenue: Number.parseInt(context.get('current_year_estimate')).toLocaleString('fr-FR'),
      companyType: this.i18n.t(
        `workflows.igs_calculator.${context.get('company_type')}`,
        {},
        context.session.language
      ),
      name: context.get('company_name'),
      phone: context.get('phone_number'),
      city:
        context.get('city_selection') === 'other'
          ? context.get('neighborhood_input')
          : this.i18n.t(
              `workflows.igs_calculator.city_${context.get('city_selection')}`,
              {},
              context.session.language
            ),
      neighborhood:
        context.get('city_selection') === 'other'
          ? 'À préciser'
          : context.get('neighborhood_input'),
      niu: context.get('niu_input'),
      calculatedIGS: this.calculateIGS(
        Number.parseInt(context.get('previous_year_revenue'))
      ).toLocaleString('fr-FR'),
    }

    return this.i18n.t(
      'workflows.igs_calculator.confirmation_summary',
      data,
      context.session.language
    )
  }

  private buildCompanyData(context: WorkflowContext): any {
    const previousRevenue = Number.parseInt(context.get('previous_year_revenue'))

    return {
      userId: context.session.userId,
      sector: context.get('sector_selection'),
      subcategory: context.get('subcategory_selection'),
      previousYearRevenue: previousRevenue,
      currentYearEstimate: Number.parseInt(context.get('current_year_estimate')),
      companyType: context.get('company_type'),
      name: context.get('company_name'),
      phoneNumber: context.get('phone_number').replace(/\D/g, ''),
      city:
        context.get('city_selection') === 'other'
          ? context.get('neighborhood_input')
          : context.get('city_selection'),
      neighborhood:
        context.get('city_selection') === 'other' ? '' : context.get('neighborhood_input'),
      niu: context.get('niu_input'),
      calculatedIGS: this.calculateIGS(previousRevenue),
    }
  }

  private calculateIGS(revenue: number): number {
    if (revenue < 500000) return 20000
    if (revenue < 1000000) return 30000
    if (revenue < 1500000) return 40000
    if (revenue < 2000000) return 50000
    if (revenue < 2500000) return 50000
    if (revenue < 5000000) return 60000
    if (revenue < 10000000) return 150000
    if (revenue < 20000000) return 300000
    if (revenue < 30000000) return 500000
    return 2000000
  }

  public async executeStep(
    stepId: string,
    input: string,
    context: WorkflowContext
  ): Promise<StepResult> {
    // Gestion spéciale pour la confirmation restart
    if (stepId === 'confirmation' && input === '2') {
      // Index 2 pour "restart"
      // Réinitialiser le workflow et recommencer
      const definition = this.getDefinition()
      const firstStep = definition.steps[0]

      // Vider les données du contexte (utiliser set avec undefined au lieu de remove)
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
    const definition = this.getDefinition()
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
    if (step.id === 'save_company') {
      if (result.success) {
        const message = this.messageBuilder.build({
          content: this.i18n.t(
            'workflows.igs_calculator.completion',
            {
              calculatedIGS: result.calculatedIGS.toLocaleString('fr-FR'),
              companyId: result.companyId,
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
            'workflows.igs_calculator.error_saving',
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
