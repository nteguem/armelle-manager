import type { SessionContext } from '#bot/types/bot_types'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'yaml'
import logger from '@adonisjs/core/services/logger'

interface WorkflowDefinition {
  id: string
  name: string
  startStep: string
  steps: Record<string, WorkflowStep>
}

interface WorkflowStep {
  type: 'input' | 'service' | 'menu' | 'message'
  messageKey?: string
  validation?: ValidationRule
  saveAs?: string
  service?: string
  method?: string
  params?: Record<string, any>
  options?: MenuOption[]
  next?: string | NextCondition[]
  onSuccess?: string | NextCondition[]
  onError?: string
}

interface ValidationRule {
  required?: boolean
  minLength?: number
  maxLength?: number
  pattern?: string
  type?: 'text' | 'number' | 'email'
}

interface MenuOption {
  id: string
  labelKey: string
  value: any
}

interface NextCondition {
  if: string
  then: string
}

interface WorkflowResult {
  action:
    | 'send_message'
    | 'call_service'
    | 'complete_workflow'
    | 'validation_error'
    | 'service_error'
  messageKey?: string
  serviceCall?: { service: string; method: string; params: Record<string, any> }
  nextStep?: string
  validationError?: string
  workflowData?: Record<string, any>
  menuOptions?: MenuOption[]
  shouldProcessNext?: boolean
  content?: string
}

export default class WorkflowManager {
  private static instance: WorkflowManager
  private workflows: Map<string, WorkflowDefinition> = new Map()

  private constructor() {}

  public static getInstance(): WorkflowManager {
    if (!WorkflowManager.instance) {
      WorkflowManager.instance = new WorkflowManager()
    }
    return WorkflowManager.instance
  }

  public async initialize(): Promise<void> {
    try {
      const workflowsPath = join(process.cwd(), 'config', 'workflows')
      const files = readdirSync(workflowsPath).filter(
        (file) => file.endsWith('.yml') || file.endsWith('.yaml')
      )

      for (const file of files) {
        const filePath = join(workflowsPath, file)
        const content = readFileSync(filePath, 'utf-8')
        const workflow: WorkflowDefinition = yaml.parse(content)

        this.workflows.set(workflow.id, workflow)
        logger.info(`Workflow loaded: ${workflow.id}`)
      }

      logger.info(`WorkflowManager initialized with ${this.workflows.size} workflows`)
    } catch (error) {
      logger.error('Failed to initialize WorkflowManager:', error)
      throw error
    }
  }

  public async startWorkflow(
    sessionContext: SessionContext,
    workflowId: string
  ): Promise<WorkflowResult> {
    const workflow = this.workflows.get(workflowId)
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`)
    }

    sessionContext.workflowData = {
      workflow_id: workflowId,
      started_at: new Date().toISOString(),
    }

    sessionContext.currentWorkflow = workflowId
    sessionContext.currentStep = workflow.startStep

    return this.processStep(sessionContext, undefined, workflow.startStep)
  }

  public async processStep(
    sessionContext: SessionContext,
    userInput?: string,
    overrideStepId?: string
  ): Promise<WorkflowResult> {
    if (!sessionContext.currentWorkflow) {
      throw new Error('No active workflow in session')
    }

    const workflow = this.workflows.get(sessionContext.currentWorkflow)
    if (!workflow) {
      throw new Error(`Workflow not found: ${sessionContext.currentWorkflow}`)
    }

    const stepId = overrideStepId || sessionContext.currentStep
    if (!stepId) {
      throw new Error('No current step in workflow')
    }

    const step = workflow.steps[stepId]
    if (!step) {
      throw new Error(`Step not found: ${stepId}`)
    }

    try {
      switch (step.type) {
        case 'input':
          return this.processInputStep(step, sessionContext, userInput)
        case 'service':
          return this.processServiceStep(step, sessionContext)
        case 'menu':
          return this.processMenuStep(step, sessionContext, userInput)
        case 'message':
          return this.processMessageStep(step, sessionContext)
        default:
          throw new Error(`Unknown step type: ${step.type}`)
      }
    } catch (error) {
      logger.error(`Workflow step error: ${sessionContext.currentWorkflow}:${stepId}`, error)
      throw error
    }
  }

  public async handleServiceResult(
    sessionContext: SessionContext,
    serviceResult: any,
    serviceError?: string
  ): Promise<WorkflowResult> {
    if (!sessionContext.currentWorkflow || !sessionContext.currentStep) {
      throw new Error('No active workflow or step')
    }

    const workflow = this.workflows.get(sessionContext.currentWorkflow)
    const step = workflow?.steps[sessionContext.currentStep]

    if (!step || step.type !== 'service') {
      throw new Error('Current step is not a service step')
    }

    if (serviceError) {
      const errorStep = step.onError
      if (errorStep) {
        return {
          action: 'send_message',
          nextStep: errorStep,
          workflowData: sessionContext.workflowData,
        }
      }

      return {
        action: 'service_error',
        validationError: serviceError,
        workflowData: sessionContext.workflowData,
      }
    }

    sessionContext.workflowData['service_result'] = serviceResult
    sessionContext.workflowData[`${step.service}_result`] = serviceResult

    if (step.saveAs) {
      sessionContext.workflowData[step.saveAs] = serviceResult
    }

    const nextConfig = step.onSuccess || step.next
    const nextStep = this.determineNextStep(nextConfig, sessionContext.workflowData)

    if (!nextStep) {
      return {
        action: 'complete_workflow',
        workflowData: sessionContext.workflowData,
      }
    }

    return {
      action: 'send_message',
      nextStep,
      workflowData: sessionContext.workflowData,
      shouldProcessNext: true,
    }
  }

  private processInputStep(
    step: WorkflowStep,
    sessionContext: SessionContext,
    userInput?: string
  ): WorkflowResult {
    if (!userInput) {
      return {
        action: 'send_message',
        messageKey: step.messageKey!,
        workflowData: sessionContext.workflowData,
      }
    }

    if (step.validation) {
      const validation = this.validateInput(userInput, step.validation)
      if (!validation.valid) {
        return {
          action: 'validation_error',
          validationError: validation.error,
          messageKey: step.messageKey!,
        }
      }
    }

    const saveKey = step.saveAs || 'input_value'
    sessionContext.workflowData[saveKey] = userInput.trim()
    sessionContext.workflowData['last_input'] = userInput.trim()

    const nextStep = this.determineNextStep(step.next, sessionContext.workflowData)

    if (!nextStep) {
      return { action: 'complete_workflow' }
    }

    return {
      action: 'send_message',
      nextStep,
      workflowData: sessionContext.workflowData,
      shouldProcessNext: true,
    }
  }

  // app/bot/core/workflow/workflow_manager.ts - AJOUTER dans processServiceStep

  private processServiceStep(step: WorkflowStep, sessionContext: SessionContext): WorkflowResult {
    if (!step.service || !step.method) {
      throw new Error('Service step requires service and method')
    }

    // DEBUG TEMPORAIRE
    console.log('🔍 DEBUG Service Step:', {
      stepService: step.service,
      stepMethod: step.method,
      stepParams: step.params,
      workflowData: sessionContext.workflowData,
      selectedTaxpayer: sessionContext.workflowData.selected_taxpayer,
      sessionUserId: sessionContext.userId,
    })

    const interpolatedParams = this.interpolateObject(step.params || {}, {
      ...sessionContext.workflowData,
      sessionUserId: sessionContext.userId, // AJOUTER ICI
    })

    console.log('🔍 DEBUG Interpolated Params:', interpolatedParams)

    sessionContext.workflowData['current_service'] = step.service
    sessionContext.workflowData['current_method'] = step.method

    return {
      action: 'call_service',
      messageKey: step.messageKey,
      serviceCall: {
        service: step.service,
        method: step.method,
        params: interpolatedParams,
      },
      workflowData: sessionContext.workflowData,
    }
  }

  private processMenuStep(
    step: WorkflowStep,
    sessionContext: SessionContext,
    userInput?: string
  ): WorkflowResult {
    if (!userInput) {
      let menuOptions = step.options || []
      let messageKey = step.messageKey!

      if (!menuOptions.length && sessionContext.workflowData.service_result?.data) {
        const taxpayers = sessionContext.workflowData.service_result.data

        // GESTION TROP DE RÉSULTATS (> 10)
        if (taxpayers.length > 10) {
          return {
            action: 'send_message',
            messageKey: 'workflows.onboarding.select_too_many',
            nextStep: 'collect_name', // Retour automatique étape 1
            workflowData: sessionContext.workflowData,
            shouldProcessNext: true,
          }
        }

        // Générer options numérotées
        menuOptions = taxpayers.map((taxpayer: any, index: number) => ({
          id: String(index + 1),
          labelKey: `${taxpayer.nomRaisonSociale} ${taxpayer.prenomSigle || ''} - ${taxpayer.centre || 'Centre non spécifié'}`,
          value: taxpayer,
        }))

        // Ajouter option "0. Aucun"
        menuOptions.push({
          id: '0',
          labelKey: 'Aucun de ces profils',
          value: null,
        })

        sessionContext.workflowData.current_menu_options = menuOptions
      }

      return {
        action: 'send_message',
        messageKey,
        menuOptions,
        workflowData: sessionContext.workflowData,
      }
    }

    const availableOptions = step.options || sessionContext.workflowData.current_menu_options || []
    const selectedOption = availableOptions.find((opt: any) => opt.id === userInput.trim())

    if (!selectedOption) {
      return {
        action: 'validation_error',
        validationError: 'Option invalide. Veuillez choisir une option proposée.',
        messageKey: step.messageKey!,
        menuOptions: availableOptions,
      }
    }

    if (selectedOption.id === '0') {
      return {
        action: 'send_message',
        nextStep: 'complete_name_only',
        workflowData: sessionContext.workflowData,
        shouldProcessNext: true,
      }
    }

    const saveKey = step.saveAs || 'selected_option'
    sessionContext.workflowData[saveKey] = selectedOption.value
    sessionContext.workflowData['selected_option_id'] = selectedOption.id

    const nextStep = this.determineNextStep(step.next, sessionContext.workflowData)

    if (!nextStep) {
      return { action: 'complete_workflow' }
    }

    return {
      action: 'send_message',
      nextStep,
      workflowData: sessionContext.workflowData,
      shouldProcessNext: true,
    }
  }
  private processMessageStep(step: WorkflowStep, sessionContext: SessionContext): WorkflowResult {
    const nextStep = this.determineNextStep(step.next, sessionContext.workflowData)

    if (!nextStep) {
      return {
        action: 'complete_workflow',
        messageKey: step.messageKey!,
        workflowData: sessionContext.workflowData,
      }
    }

    return {
      action: 'send_message',
      messageKey: step.messageKey!,
      nextStep,
      workflowData: sessionContext.workflowData,
      shouldProcessNext: true,
    }
  }

  private validateInput(input: string, rules: ValidationRule): { valid: boolean; error?: string } {
    const trimmedInput = input.trim()

    if (rules.required && !trimmedInput) {
      return { valid: false, error: 'Ce champ est obligatoire' }
    }

    if (!trimmedInput && !rules.required) {
      return { valid: true }
    }

    if (rules.minLength && trimmedInput.length < rules.minLength) {
      return { valid: false, error: `Minimum ${rules.minLength} caractères requis` }
    }

    if (rules.maxLength && trimmedInput.length > rules.maxLength) {
      return { valid: false, error: `Maximum ${rules.maxLength} caractères autorisés` }
    }

    if (rules.type === 'number') {
      const num = Number(trimmedInput)
      if (Number.isNaN(num)) {
        return { valid: false, error: 'Veuillez entrer un nombre valide' }
      }
    }

    if (rules.type === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(trimmedInput)) {
        return { valid: false, error: 'Adresse email invalide' }
      }
    }

    if (rules.pattern) {
      const regex = new RegExp(rules.pattern)
      if (!regex.test(trimmedInput)) {
        return { valid: false, error: 'Format invalide' }
      }
    }

    return { valid: true }
  }

  private interpolateVariables(text: string, variables: Record<string, any>): string {
    return text.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, varPath) => {
      if (varPath === 'userId') {
        return variables.sessionUserId || match
      }

      const value = this.getNestedValue(variables, varPath)

      // CORRECTION : Si la valeur est un objet et qu'on essaie de l'interpoler dans une string,
      // retourner le match original (ne pas convertir en "[object Object]")
      if (typeof value === 'object' && value !== null) {
        console.log(`⚠️ Cannot interpolate object ${varPath} into string, keeping placeholder`)
        return match
      }

      return value !== undefined ? String(value) : match
    })
  }

  // NOUVELLE MÉTHODE : Interpolation spéciale pour les objets
  private interpolateObject(
    obj: Record<string, any>,
    variables: Record<string, any>
  ): Record<string, any> {
    const result: Record<string, any> = {}

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        // Cas spécial : si la string est un nom de variable d'objet, récupérer l'objet directement
        if (value.startsWith('{{') && value.endsWith('}}')) {
          const varName = value.slice(2, -2)
          const directValue = this.getNestedValue(variables, varName)

          if (directValue !== undefined) {
            result[key] = directValue // Objet direct, pas de string conversion
          } else {
            result[key] = this.interpolateVariables(value, variables)
          }
        } else {
          result[key] = this.interpolateVariables(value, variables)
        }
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.interpolateObject(value, variables)
      } else {
        result[key] = value
      }
    }

    return result
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined
    }, obj)
  }

  private determineNextStep(
    nextConfig: string | NextCondition[] | undefined,
    context: Record<string, any>
  ): string | null {
    if (!nextConfig) {
      return null
    }

    if (typeof nextConfig === 'string') {
      return nextConfig
    }

    for (const condition of nextConfig) {
      if (this.evaluateCondition(condition.if, context)) {
        return condition.then
      }
    }

    const defaultCondition = nextConfig.find((c) => 'default' in c)
    return defaultCondition ? (defaultCondition as any).default : null
  }

  private evaluateCondition(condition: string, context: Record<string, any>): boolean {
    try {
      let evaluableCondition = condition

      const variableMatches = condition.match(/(\w+(?:\.\w+)*)/g) || []

      for (const varPath of variableMatches) {
        const value = this.getNestedValue(context, varPath)
        if (value !== undefined) {
          const jsonValue = JSON.stringify(value)
          evaluableCondition = evaluableCondition.replace(
            new RegExp(`\\b${varPath.replace('.', '\\.')}\\b`, 'g'),
            jsonValue
          )
        }
      }

      const func = new Function(`
        "use strict";
        return (${evaluableCondition});
      `)

      return Boolean(func())
    } catch (error) {
      logger.warn(`Failed to evaluate condition: ${condition}`, error)
      return false
    }
  }

  public getWorkflow(workflowId: string): WorkflowDefinition | undefined {
    return this.workflows.get(workflowId)
  }

  public getAvailableWorkflows(): string[] {
    return Array.from(this.workflows.keys())
  }
}
