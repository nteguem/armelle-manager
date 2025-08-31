import type {
  WorkflowStepDefinition,
  WorkflowContext,
  StepResult,
} from '../engine/workflow_context.js'

/**
 * Interface abstraite pour tous les types d'étapes
 */
export abstract class BaseStep {
  /**
   * Type d'étape (input, service, menu, etc.)
   */
  abstract readonly type: string

  /**
   * Exécute l'étape avec le contexte donné
   */
  abstract execute(
    stepDefinition: WorkflowStepDefinition,
    context: WorkflowContext,
    userInput?: string
  ): Promise<StepResult>

  /**
   * Valide la configuration de l'étape
   */
  public validateConfig(config: Record<string, any>): { valid: boolean; error?: string } {
    // Validation basique par défaut
    return { valid: true }
  }

  /**
   * Interpole variables dans une chaîne
   */
  protected interpolateString(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, varPath) => {
      const value = this.getNestedValue(variables, varPath)
      return value !== undefined ? String(value) : match
    })
  }

  /**
   * Interpole variables dans un objet
   */
  protected interpolateObject(
    obj: Record<string, any>,
    variables: Record<string, any>
  ): Record<string, any> {
    const result: Record<string, any> = {}

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.interpolateString(value, variables)
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.interpolateObject(value, variables)
      } else {
        result[key] = value
      }
    }

    return result
  }

  /**
   * Récupère valeur imbriquée
   */
  protected getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined
    }, obj)
  }

  /**
   * Valide input utilisateur selon règles
   */
  protected validateInput(
    input: string,
    rules: Record<string, any>
  ): { valid: boolean; error?: string } {
    const trimmedInput = input.trim()

    if (rules.required && !trimmedInput) {
      return { valid: false, error: 'Ce champ est obligatoire' }
    }

    if (rules.minLength && trimmedInput.length < rules.minLength) {
      return { valid: false, error: `Minimum ${rules.minLength} caractères requis` }
    }

    if (rules.maxLength && trimmedInput.length > rules.maxLength) {
      return { valid: false, error: `Maximum ${rules.maxLength} caractères autorisés` }
    }

    if (rules.type === 'number' && Number.isNaN(Number(trimmedInput))) {
      return { valid: false, error: 'Veuillez entrer un nombre valide' }
    }

    if (rules.pattern) {
      const regex = new RegExp(rules.pattern)
      if (!regex.test(trimmedInput)) {
        return { valid: false, error: 'Format invalide' }
      }
    }

    return { valid: true }
  }
}
