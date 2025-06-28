import type { ValidationRule } from '#bot/types/bot_types'

export interface ValidationResult {
  isValid: boolean
  value?: any
  error?: string
}

export default class InputValidator {
  public static validate(input: string, validation?: ValidationRule): ValidationResult {
    if (!validation) {
      return { isValid: true, value: input.trim() }
    }

    const trimmedInput = input.trim()

    if (validation.required && !trimmedInput) {
      return { isValid: false, error: 'required_field' }
    }

    if (!trimmedInput && !validation.required) {
      return { isValid: true, value: '' }
    }

    switch (validation.type) {
      case 'name':
        return this.validateName(trimmedInput, validation)
      case 'text':
        return this.validateText(trimmedInput, validation)
      case 'number':
        return this.validateNumber(trimmedInput, validation)
      case 'phone':
        return this.validatePhone(trimmedInput)
      case 'email':
        return this.validateEmail(trimmedInput)
      case 'amount':
        return this.validateAmount(trimmedInput, validation)
      default:
        return { isValid: true, value: trimmedInput }
    }
  }

  private static validateName(input: string, validation: ValidationRule): ValidationResult {
    const namePattern = /^[a-zA-ZÀ-ÿ\s'-\/]+$/
    if (!namePattern.test(input)) {
      return { isValid: false, error: 'invalid_format' }
    }
    if (validation.minLength && input.length < validation.minLength) {
      return { isValid: false, error: 'text_too_short' }
    }
    if (validation.maxLength && input.length > validation.maxLength) {
      return { isValid: false, error: 'text_too_long' }
    }
    return { isValid: true, value: input.trim() }
  }

  private static validateText(input: string, validation: ValidationRule): ValidationResult {
    if (validation.minLength && input.length < validation.minLength) {
      return { isValid: false, error: 'text_too_short' }
    }
    if (validation.maxLength && input.length > validation.maxLength) {
      return { isValid: false, error: 'text_too_long' }
    }
    return { isValid: true, value: input }
  }

  private static validateNumber(input: string, validation: ValidationRule): ValidationResult {
    const num = Number.parseFloat(input.replace(/[\s,]/g, ''))
    if (Number.isNaN(num)) {
      return { isValid: false, error: 'invalid_format' }
    }
    if (validation.min !== undefined && num < validation.min) {
      return { isValid: false, error: 'amount_too_low' }
    }
    if (validation.max !== undefined && num > validation.max) {
      return { isValid: false, error: 'amount_too_high' }
    }
    return { isValid: true, value: num }
  }

  private static validatePhone(input: string): ValidationResult {
    const cleanInput = input.replace(/[\s\-\(\)\.]/g, '')

    if (cleanInput.length < 8) {
      return { isValid: false, error: 'phone_too_short' }
    }

    if (cleanInput.length > 15) {
      return { isValid: false, error: 'phone_too_long' }
    }

    const phonePattern = /^[\+]?[0-9]+$/
    if (!phonePattern.test(cleanInput)) {
      return { isValid: false, error: 'invalid_phone_format' }
    }

    return { isValid: true, value: cleanInput }
  }

  private static validateEmail(input: string): ValidationResult {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(input)) {
      return { isValid: false, error: 'invalid_email' }
    }
    return { isValid: true, value: input.toLowerCase() }
  }

  private static validateAmount(input: string, validation: ValidationRule): ValidationResult {
    return this.validateNumber(input, validation)
  }
}
