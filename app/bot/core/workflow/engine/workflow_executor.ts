import type { WorkflowStep, WorkflowContext } from '../../../types/workflow_types.js'
import type { BaseWorkflow } from '../definitions/base_workflow.js'
import type { SessionContext } from '#bot/types/bot_types'
import StepValidator from '../validators/step_validator.js'
import WorkflowNavigator from './workflow_navigator.js'

export default class WorkflowExecutor {
  private workflow: BaseWorkflow
  private context: WorkflowContext
  private navigator: WorkflowNavigator
  private services: Map<string, any> = new Map()
  private sessionContext?: SessionContext

  constructor(workflow: BaseWorkflow, context: WorkflowContext, sessionContext?: SessionContext) {
    this.workflow = workflow
    this.context = context
    this.navigator = new WorkflowNavigator(workflow, context)
    this.sessionContext = sessionContext
  }

  registerService(name: string, service: any): void {
    this.services.set(name, service)
  }

  async processInput(input: string): Promise<{
    success: boolean
    error?: string
    nextStep?: WorkflowStep | null
    complete?: boolean
    data?: any
  }> {
    const currentStep = this.navigator.getCurrentStep()
    if (!currentStep) {
      return { success: false, error: 'No current step' }
    }

    // Étape input ou choice
    if (currentStep.type === 'input' || currentStep.type === 'choice') {
      const validation = StepValidator.validate(currentStep, input)
      if (!validation.valid) {
        return { success: false, error: validation.error }
      }

      // Sauvegarder l'input
      const sanitizedInput = StepValidator.sanitizeInput(input)
      this.context.data[currentStep.id] = sanitizedInput

      // Pour l'onboarding, si on est à l'étape de sélection
      if (
        this.workflow.getDefinition().id === 'onboarding' &&
        currentStep.id === 'taxpayer_selection'
      ) {
        // On doit appeler le service de confirmation avec les données
        const confirmStep = this.workflow.getStep('confirm_selection')
        if (confirmStep && confirmStep.service) {
          const service = this.services.get(confirmStep.service.name)
          if (service) {
            const method = service[confirmStep.service.method]
            if (method) {
              // Préparer les paramètres pour la confirmation
              const params = {
                selection: sanitizedInput,
                taxpayers: this.context.data.taxpayers || [],
                userName: this.context.data.userName || this.context.data.collect_name || '',
              }

              // Appeler le service de confirmation
              const result = await method.call(service, params, this.sessionContext)

              // Sauvegarder le résultat
              this.context.data.confirm_selection = result

              // Terminer le workflow
              await this.complete()
              return {
                success: true,
                complete: true,
                data: {
                  ...this.context.data,
                  ...result,
                },
              }
            }
          }
        }
      }
    }

    // Étape message
    if (currentStep.type === 'message') {
      this.context.data[currentStep.id] = 'shown'
    }

    // Passer à l'étape suivante
    const nextStep = this.navigator.moveNext(currentStep.id)

    if (!nextStep) {
      await this.complete()
      return { success: true, complete: true, data: this.context.data }
    }

    // Étape service
    if (nextStep.type === 'service') {
      return await this.executeServiceStep(nextStep)
    }

    return { success: true, nextStep }
  }

  private async executeServiceStep(step: WorkflowStep): Promise<any> {
    if (!step.service) {
      return { success: false, error: 'Service configuration missing' }
    }

    const service = this.services.get(step.service.name)
    if (!service) {
      return { success: false, error: `Service ${step.service.name} not found` }
    }

    try {
      const method = service[step.service.method]
      if (typeof method !== 'function') {
        return { success: false, error: `Method ${step.service.method} not found` }
      }

      // Passer les données ET le sessionContext
      const params = { ...this.context.data, ...(step.service.params || {}) }
      const result = await method.call(service, params, this.sessionContext)

      // Sauvegarder le résultat
      this.context.data[step.id] = result

      // Traiter les résultats du service processDGISearch
      if (step.service.method === 'processDGISearch') {
        // Pas de contribuable ou erreur = fin
        if (result.resultType === 'no_taxpayer' || result.resultType === 'error') {
          return {
            success: true,
            complete: true,
            data: {
              ...this.context.data,
              profileType: 'partial',
              userName: result.userName,
            },
          }
        }

        // Contribuables trouvés = préparer la sélection
        if (result.resultType === 'single' || result.resultType === 'multiple') {
          const nextStep = this.workflow.getStep('taxpayer_selection')

          if (nextStep) {
            // Créer les choix
            const choices = result.taxpayers.map((t: any, idx: number) => ({
              value: `${idx + 1}`,
              label: `${t.name}${t.centre ? ` - ${t.centre}` : ''}`,
            }))

            choices.push({
              value: '0',
              label:
                result.resultType === 'single' ? "Ce n'est pas mon profil" : 'Aucun de ces profils',
            })

            nextStep.choices = choices
            nextStep.prompt =
              result.resultType === 'single'
                ? 'workflows.onboarding.confirm_single'
                : 'workflows.onboarding.select_multiple'

            // Sauvegarder les données
            this.context.data.taxpayers = result.taxpayers
            this.context.data.resultType = result.resultType
            this.context.data.userName = result.userName

            // Aller à l'étape de sélection
            this.navigator.goToStep('taxpayer_selection')

            return {
              success: true,
              nextStep: nextStep,
              data: result,
            }
          }
        }
      }

      // Continuer normalement
      const nextStep = this.navigator.moveNext(step.id)

      if (!nextStep) {
        await this.complete()
        return { success: true, complete: true, data: this.context.data }
      }

      if (nextStep.type === 'service') {
        return await this.executeServiceStep(nextStep)
      }

      return { success: true, nextStep, data: result }
    } catch (error: any) {
      console.error('Service execution error:', error)
      return {
        success: false,
        error: error.message || 'Service execution failed',
      }
    }
  }

  goBack(): { success: boolean; step?: WorkflowStep | null; error?: string } {
    if (!this.navigator.canGoBack()) {
      return { success: false, error: 'Cannot go back from this step' }
    }

    const previousStep = this.navigator.moveBack()
    return { success: true, step: previousStep }
  }

  private findChoice(step: WorkflowStep, input: string) {
    if (!step.choices) return null

    let choice = step.choices.find((c) => c.value === input)

    if (!choice) {
      const index = Number.parseInt(input) - 1
      if (!Number.isNaN(index) && index >= 0 && index < step.choices.length) {
        choice = step.choices[index]
      }
    }

    return choice
  }

  private async complete(): Promise<void> {
    const definition = this.workflow.getDefinition()
    if (definition.onComplete) {
      await definition.onComplete(this.context.data)
    }
  }

  getCurrentStep(): WorkflowStep | null {
    return this.navigator.getCurrentStep()
  }

  getContext(): WorkflowContext {
    return this.context
  }
}
