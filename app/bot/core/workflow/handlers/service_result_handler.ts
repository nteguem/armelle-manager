import type { ServiceResult, WorkflowContext } from '../engine/workflow_context.js'
import { WorkflowServiceRegistry } from '../services/workflow_service_registry.js'
import { WorkflowEngine } from '../engine/workflow_engine.js'
import { TransitionEngine } from '../engine/transition_engine.js'
import { DynamicMenuGenerator } from '../services/dynamic_menu_generator.js'
import { MessagePresenter } from '../presentation/message_presenter.js'
import I18nManager from '#bot/core/managers/i18n_manager'

export default class ServiceResultHandler {
  private serviceRegistry: WorkflowServiceRegistry
  private workflowEngine: WorkflowEngine
  private transitionEngine: TransitionEngine
  private menuGenerator: DynamicMenuGenerator
  private messagePresenter: MessagePresenter
  private i18n: I18nManager

  constructor() {
    this.serviceRegistry = WorkflowServiceRegistry.getInstance()
    this.workflowEngine = WorkflowEngine.getInstance()
    this.transitionEngine = new TransitionEngine()
    this.menuGenerator = DynamicMenuGenerator.getInstance()
    this.messagePresenter = MessagePresenter.getInstance()
    this.i18n = I18nManager.getInstance()
  }

  public async handle(result: ServiceResult, context: WorkflowContext): Promise<any> {
    try {
      const { service, method, params } = result.serviceCall

      // Message de progression avec MessagePresenter pour subheader/footer automatiques
      if (result.messageKey) {
        const progressResult = {
          action: 'send_message' as const,
          messageKey: result.messageKey,
        }
        const progressMessage = this.messagePresenter.format(progressResult, context)
        await this.sendMessage(context.session, progressMessage)
      }

      const serviceParams = Object.values(params || {})
      const serviceResult = await this.serviceRegistry.call(service, method, serviceParams)

      const saveKey = result.saveAs || 'service_result'
      context.variables[saveKey] = serviceResult
      context.session.workflowData = context.variables

      return await this.processServiceResult(serviceResult, context)
    } catch (error) {
      console.error('Service call failed:', error)
      return {
        action: 'validation_error',
        error: error.message || "Erreur lors de l'appel du service",
      }
    }
  }

  private async processServiceResult(serviceResult: any, context: WorkflowContext): Promise<any> {
    if (serviceResult?.messageType) {
      return await this.handleServiceMessage(serviceResult, context)
    }

    if (serviceResult?.success === false) {
      return await this.handleServiceError(serviceResult, context)
    }

    return await this.continueWorkflow(context)
  }

  private async handleServiceMessage(serviceResult: any, context: WorkflowContext): Promise<any> {
    const { messageType } = serviceResult

    switch (messageType) {
      case 'selection':
        await this.handleSelectionMessage(serviceResult, context)
        break

      case 'retry':
        await this.handleRetryMessage(serviceResult, context)
        break

      case 'completion':
      case 'error':
      default:
        await this.handleCompletionMessage(serviceResult, context)
        break
    }

    return { action: 'complete_workflow' }
  }

  private async handleSelectionMessage(
    serviceResult: any,
    context: WorkflowContext
  ): Promise<void> {
    const selectionData = serviceResult.data
    if (!selectionData) {
      await this.handleCompletionMessage(serviceResult, context)
      return
    }

    if (selectionData.taxpayers) {
      await this.handleTaxpayerSelection(serviceResult, context)
      return
    }

    await this.handleGenericSelection(serviceResult, context)
  }

  private async handleTaxpayerSelection(
    serviceResult: any,
    context: WorkflowContext
  ): Promise<void> {
    const { taxpayers } = serviceResult.data

    const options = taxpayers
      .map(
        (tp: any, index: number) =>
          `${index + 1}. ${tp.nomRaisonSociale} ${tp.prenomSigle || ''} - ${tp.centre || ''}`
      )
      .join('\n')

    const selectionResult = {
      action: 'send_message' as const,
      content:
        this.i18n.t(
          serviceResult.messageKey || 'common.selection.choose',
          {},
          context.session.language
        ) +
        '\n\n' +
        options +
        '\n0. Aucun de ces profils',
    }

    const selectionMessage = this.messagePresenter.format(selectionResult, context)
    await this.sendMessage(context.session, selectionMessage)

    context.variables.pending_selection = serviceResult.data
    context.session.workflowData = context.variables
  }

  private async handleGenericSelection(
    serviceResult: any,
    context: WorkflowContext
  ): Promise<void> {
    const selectionItems = Array.isArray(serviceResult.data)
      ? serviceResult.data
      : [serviceResult.data]

    const menuOptions = this.menuGenerator.generateFromArray(selectionItems, {
      addNoneOption: true,
      noneOptionLabel: 'Aucun de ces choix',
    })

    const optionsText = menuOptions.map((opt) => `${opt.id}. ${opt.label}`).join('\n')

    const selectionResult = {
      action: 'send_message' as const,
      content:
        this.i18n.t(
          serviceResult.messageKey || 'common.selection.choose',
          {},
          context.session.language
        ) +
        '\n\n' +
        optionsText,
    }

    const selectionMessage = this.messagePresenter.format(selectionResult, context)
    await this.sendMessage(context.session, selectionMessage)

    context.variables.pending_selection = serviceResult.data
    context.session.workflowData = context.variables
  }

  private async handleRetryMessage(serviceResult: any, context: WorkflowContext): Promise<void> {
    const retryResult = {
      action: 'send_message' as const,
      content: this.i18n.t(
        serviceResult.messageKey || 'common.retry.message',
        serviceResult.messageParams || {},
        context.session.language
      ),
    }

    const retryMessage = this.messagePresenter.format(retryResult, context)
    await this.sendMessage(context.session, retryMessage)

    const retryStep = serviceResult.retryStep || this.getWorkflowStartStep(context)
    if (retryStep) {
      context.currentStep = retryStep
      context.session.currentStep = retryStep

      if (serviceResult.clearVariables) {
        const keysToKeep = serviceResult.keepVariables || []
        const newVariables: Record<string, any> = {}
        keysToKeep.forEach((key: string | number) => {
          if (context.variables[key] !== undefined) {
            newVariables[key] = context.variables[key]
          }
        })
        context.variables = newVariables
        context.session.workflowData = newVariables
      }
    }
  }

  private async handleCompletionMessage(
    serviceResult: any,
    context: WorkflowContext
  ): Promise<void> {
    if (serviceResult.messageKey) {
      const completionResult = {
        action: 'send_message' as const,
        messageKey: serviceResult.messageKey,
        content: this.i18n.t(
          serviceResult.messageKey,
          serviceResult.messageParams || {},
          context.session.language
        ),
      }

      const completionMessage = this.messagePresenter.format(completionResult, context)
      await this.sendMessage(context.session, completionMessage)
    }
  }

  private async handleServiceError(serviceResult: any, context: WorkflowContext): Promise<any> {
    const errorResult = {
      action: 'validation_error' as const,
      error: this.i18n.t(
        serviceResult.messageKey || 'errors.service.generic',
        serviceResult.messageParams || {},
        context.session.language
      ),
    }

    const errorMessage = this.messagePresenter.formatError(errorResult.error, context)
    await this.sendMessage(context.session, errorMessage)
    return { action: 'complete_workflow' }
  }

  private async continueWorkflow(context: WorkflowContext): Promise<any> {
    const workflow = this.workflowEngine.getWorkflow(context.workflowId)
    if (!workflow) {
      return { action: 'complete_workflow' }
    }

    const stepDef = workflow.steps[context.currentStep]
    if (!stepDef?.nextStep) {
      return { action: 'complete_workflow' }
    }

    const nextStep = this.transitionEngine.resolve(stepDef.nextStep, context.variables)
    if (nextStep) {
      context.currentStep = nextStep
      context.session.currentStep = nextStep
      return await this.workflowEngine.processStep(context)
    }

    return { action: 'complete_workflow' }
  }

  private getWorkflowStartStep(context: WorkflowContext): string | null {
    const workflow = this.workflowEngine.getWorkflow(context.workflowId)
    return workflow?.startStep || null
  }

  private async sendMessage(sessionContext: any, content: string): Promise<void> {
    console.log('Send message - to be injected')
  }
}
