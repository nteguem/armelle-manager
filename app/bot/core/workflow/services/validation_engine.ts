import logger from '@adonisjs/core/services/logger'

/**
 * Règles de validation
 */
export interface ValidationRule {
  required?: boolean
  minLength?: number
  maxLength?: number
  type?: 'text' | 'number' | 'email' | 'phone'
  pattern?: string
  min?: number
  max?: number
  custom?: (value: any) => boolean | string
}

/**
 * Résultat de validation
 */
export interface ValidationResult {
  valid: boolean
  error?: string
  value?: any
}

/**
 * Moteur de validation des inputs utilisateur
 */
export class ValidationEngine {
  private static instance: ValidationEngine

  private constructor() {}

  public static getInstance(): ValidationEngine {
    if (!ValidationEngine.instance) {
      ValidationEngine.instance = new ValidationEngine()
    }
    return ValidationEngine.instance
  }

  /**
   * Valide une valeur selon les règles
   */
  public validate(input: string, rules: ValidationRule): ValidationResult {
    const trimmedInput = input.trim()

    logger.debug('Validating input', { input: input.substring(0, 50), rules })

    // Required
    if (rules.required && !trimmedInput) {
      return { valid: false, error: 'Ce champ est obligatoire' }
    }

    // Si vide et pas required, valide
    if (!trimmedInput && !rules.required) {
      return { valid: true, value: trimmedInput }
    }

    // Longueur minimum
    if (rules.minLength && trimmedInput.length < rules.minLength) {
      return {
        valid: false,
        error: `Minimum ${rules.minLength} caractères requis`,
      }
    }

    // Longueur maximum
    if (rules.maxLength && trimmedInput.length > rules.maxLength) {
      return {
        valid: false,
        error: `Maximum ${rules.maxLength} caractères autorisés`,
      }
    }

    // Validation par type
    const typeValidation = this.validateByType(trimmedInput, rules.type)
    if (!typeValidation.valid) {
      return typeValidation
    }

    // Pattern regex
    if (rules.pattern) {
      const regex = new RegExp(rules.pattern)
      if (!regex.test(trimmedInput)) {
        return { valid: false, error: 'Format invalide' }
      }
    }

    // Validation numérique (min/max)
    if (rules.type === 'number') {
      const numValue = Number(trimmedInput)

      if (rules.min !== undefined && numValue < rules.min) {
        return { valid: false, error: `Valeur minimum: ${rules.min}` }
      }

      if (rules.max !== undefined && numValue > rules.max) {
        return { valid: false, error: `Valeur maximum: ${rules.max}` }
      }

      return { valid: true, value: numValue }
    }

    // Validation personnalisée
    if (rules.custom) {
      const customResult = rules.custom(trimmedInput)
      if (customResult !== true) {
        return {
          valid: false,
          error:
            typeof customResult === 'string' ? customResult : 'Validation personnalisée échouée',
        }
      }
    }

    return { valid: true, value: trimmedInput }
  }

  /**
   * Validation par type de données
   */
  private validateByType(input: string, type?: string): ValidationResult {
    if (!type || type === 'text') {
      return { valid: true }
    }

    switch (type) {
      case 'number':
        const num = Number(input)
        if (Number.isNaN(num)) {
          return { valid: false, error: 'Veuillez entrer un nombre valide' }
        }
        return { valid: true }

      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(input)) {
          return { valid: false, error: 'Adresse email invalide' }
        }
        return { valid: true }

      case 'phone':
        // Format téléphone camerounais basique
        const phoneRegex = /^(\+?237)?[6-7]\d{8}$/
        if (!phoneRegex.test(input.replace(/\s/g, ''))) {
          return { valid: false, error: 'Numéro de téléphone invalide (ex: 677123456)' }
        }
        return { valid: true }

      default:
        logger.warn(`Unknown validation type: ${type}`)
        return { valid: true }
    }
  }

  /**
   * Valide multiple champs
   */
  public validateMultiple(
    inputs: Record<string, string>,
    rulesSet: Record<string, ValidationRule>
  ): { valid: boolean; errors: Record<string, string> } {
    const errors: Record<string, string> = {}

    for (const [field, rules] of Object.entries(rulesSet)) {
      const input = inputs[field] || ''
      const result = this.validate(input, rules)

      if (!result.valid && result.error) {
        errors[field] = result.error
      }
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    }
  }

  /**
   * Crée règles de validation communes
   */
  public static createRules(): {
    required: () => ValidationRule
    minLength: (min: number) => ValidationRule
    maxLength: (max: number) => ValidationRule
    number: (min?: number, max?: number) => ValidationRule
    email: () => ValidationRule
    phone: () => ValidationRule
  } {
    return {
      required: () => ({ required: true }),
      minLength: (min: number) => ({ minLength: min }),
      maxLength: (max: number) => ({ maxLength: max }),
      number: (min?: number, max?: number) => ({ type: 'number', min, max }),
      email: () => ({ type: 'email' }),
      phone: () => ({ type: 'phone' }),
    }
  }
}
