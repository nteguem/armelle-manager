// app/bot/core/workflow/validators/step_validator.ts

import type { WorkflowStep } from '../../../types/workflow_types.js'

/**
 * Valide les entrées utilisateur selon les règles de l'étape
 */
export default class StepValidator {
  /**
   * Valide l'input utilisateur pour une étape donnée
   */
  static validate(step: WorkflowStep, input: string): { valid: boolean; error?: string } {
    // Pas de validation pour les messages simples
    if (step.type === 'message') {
      return { valid: true }
    }

    // Validation pour les choix
    if (step.type === 'choice') {
      return this.validateChoice(step, input)
    }

    // Validation pour les inputs
    if (step.type === 'input') {
      return this.validateInput(step, input)
    }

    // Les services n'ont pas besoin de validation d'input
    if (step.type === 'service') {
      return { valid: true }
    }

    return { valid: true }
  }

  /**
   * Valide un choix
   */
  private static validateChoice(
    step: WorkflowStep,
    input: string
  ): { valid: boolean; error?: string } {
    if (!step.choices || step.choices.length === 0) {
      return { valid: false, error: 'No choices available' }
    }

    // Vérifier si l'input correspond à une valeur de choix
    const validChoice = step.choices.some((choice: { value: string }) => choice.value === input)

    if (!validChoice) {
      // Vérifier aussi les numéros (1, 2, 3...)
      const inputNumber = Number.parseInt(input)
      if (!Number.isNaN(inputNumber) && inputNumber > 0 && inputNumber <= step.choices.length) {
        return { valid: true }
      }

      return {
        valid: false,
        error: `Invalid choice. Please select from the available options.`,
      }
    }

    return { valid: true }
  }

  /**
   * Valide un input texte
   */
  private static validateInput(
    step: WorkflowStep,
    input: string
  ): { valid: boolean; error?: string } {
    if (!step.validation) {
      // Pas de règles = tout est accepté sauf vide
      return input.trim().length > 0
        ? { valid: true }
        : { valid: false, error: 'Input cannot be empty' }
    }

    const trimmedInput = input.trim()
    const validation = step.validation

    // Vérifier si requis
    if (validation.required !== false && trimmedInput.length === 0) {
      return { valid: false, error: 'This field is required' }
    }

    // Vérifier longueur minimale
    if (validation.min && trimmedInput.length < validation.min) {
      return {
        valid: false,
        error: `Minimum ${validation.min} characters required`,
      }
    }

    // Vérifier longueur maximale
    if (validation.max && trimmedInput.length > validation.max) {
      return {
        valid: false,
        error: `Maximum ${validation.max} characters allowed`,
      }
    }

    // Vérifier pattern regex
    if (validation.pattern) {
      const regex = new RegExp(validation.pattern)
      if (!regex.test(trimmedInput)) {
        return {
          valid: false,
          error: 'Invalid format',
        }
      }
    }

    return { valid: true }
  }

  /**
   * Nettoie et normalise l'input
   */
  static sanitizeInput(input: string): string {
    return input.trim()
  }
}
