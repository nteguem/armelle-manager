import type { ConditionalNext } from './workflow_context.js'
import logger from '@adonisjs/core/services/logger'

/**
 * Opérateurs supportés pour évaluation sécurisée
 */
type ComparisonOperator = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'exists' | 'not_exists'

/**
 * Expression conditionnelle parsée
 */
interface ParsedCondition {
  variable: string
  operator: ComparisonOperator
  value?: any
  valid: boolean
  error?: string
}

/**
 * Moteur de transition sécurisé
 * Remplace transition_resolver avec évaluation sans eval()
 */
export class TransitionEngine {
  /**
   * Résout la prochaine étape selon configuration
   */
  public resolve(
    nextConfig: string | ConditionalNext[] | undefined,
    variables: Record<string, any>
  ): string | null {
    if (!nextConfig) {
      return null
    }

    // Transition simple
    if (typeof nextConfig === 'string') {
      return nextConfig
    }

    // Transitions conditionnelles
    if (Array.isArray(nextConfig)) {
      logger.debug('Evaluating conditional transitions', {
        conditionsCount: nextConfig.length,
        availableVariables: Object.keys(variables),
      })

      for (const condition of nextConfig) {
        if (this.evaluateCondition(condition.condition, variables)) {
          logger.debug(`Condition matched: ${condition.condition} -> ${condition.nextStep}`)
          return condition.nextStep
        }
      }

      logger.warn('No condition matched', {
        conditions: nextConfig.map((c) => c.condition),
        availableVariables: Object.keys(variables),
      })
    }

    return null
  }

  /**
   * Évalue une condition de manière sécurisée
   */
  private evaluateCondition(condition: string, variables: Record<string, any>): boolean {
    try {
      const parsed = this.parseCondition(condition)

      if (!parsed.valid) {
        logger.warn(`Invalid condition syntax: ${condition}`, { error: parsed.error })
        return false
      }

      return this.evaluateParsedCondition(parsed, variables)
    } catch (error) {
      logger.warn(`Condition evaluation failed: ${condition}`, {
        error: error.message,
        availableVariables: Object.keys(variables),
      })
      return false
    }
  }

  /**
   * Parse une condition en composants sécurisés
   */
  private parseCondition(condition: string): ParsedCondition {
    const trimmed = condition.trim()

    // Format: "variable operator value" ou "variable operator"
    const patterns = [
      { regex: /^(\w+(?:\.\w+)*)\s+(==|!=|>=|<=|>|<)\s+(.+)$/, hasValue: true },
      { regex: /^(\w+(?:\.\w+)*)\s+(exists|not_exists)$/, hasValue: false },
    ]

    for (const pattern of patterns) {
      const match = trimmed.match(pattern.regex)
      if (match) {
        const variable = match[1]
        const operator = match[2] as ComparisonOperator
        const rawValue = pattern.hasValue ? match[3] : undefined

        return {
          variable,
          operator,
          value: rawValue ? this.parseValue(rawValue) : undefined,
          valid: true,
        }
      }
    }

    return {
      variable: '',
      operator: '==',
      valid: false,
      error: 'Condition format must be: "variable operator value" or "variable exists/not_exists"',
    }
  }

  /**
   * Parse une valeur avec support des types
   */
  private parseValue(rawValue: string): any {
    const trimmed = rawValue.trim()

    // String avec quotes
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1)
    }

    // Boolean
    if (trimmed === 'true') return true
    if (trimmed === 'false') return false
    if (trimmed === 'null') return null
    if (trimmed === 'undefined') return undefined

    // Number
    const numValue = Number(trimmed)
    if (!Number.isNaN(numValue)) {
      return numValue
    }

    // String sans quotes
    return trimmed
  }

  /**
   * Évalue condition parsée
   */
  private evaluateParsedCondition(
    condition: ParsedCondition,
    variables: Record<string, any>
  ): boolean {
    const actualValue = this.getNestedValue(variables, condition.variable)

    logger.debug('Evaluating parsed condition', {
      variable: condition.variable,
      operator: condition.operator,
      expectedValue: condition.value,
      actualValue,
    })

    switch (condition.operator) {
      case '==':
        return actualValue === condition.value

      case '!=':
        return actualValue !== condition.value

      case '>':
        return this.compareNumbers(actualValue, condition.value, (a, b) => a > b)

      case '<':
        return this.compareNumbers(actualValue, condition.value, (a, b) => a < b)

      case '>=':
        return this.compareNumbers(actualValue, condition.value, (a, b) => a >= b)

      case '<=':
        return this.compareNumbers(actualValue, condition.value, (a, b) => a <= b)

      case 'exists':
        return actualValue !== undefined && actualValue !== null

      case 'not_exists':
        return actualValue === undefined || actualValue === null

      default:
        logger.warn(`Unknown operator: ${condition.operator}`)
        return false
    }
  }

  /**
   * Compare deux valeurs numériques
   */
  private compareNumbers(a: any, b: any, compareFn: (a: number, b: number) => boolean): boolean {
    const numA = Number(a)
    const numB = Number(b)

    if (Number.isNaN(numA) || Number.isNaN(numB)) {
      logger.warn('Non-numeric values in numeric comparison', { a, b })
      return false
    }

    return compareFn(numA, numB)
  }

  /**
   * Récupère valeur imbriquée de manière sécurisée
   */
  private getNestedValue(obj: any, path: string): any {
    try {
      return path.split('.').reduce((current, key) => {
        return current && current[key] !== undefined ? current[key] : undefined
      }, obj)
    } catch (error) {
      logger.debug(`Error accessing nested value: ${path}`, { error: error.message })
      return undefined
    }
  }

  /**
   * Valide syntaxe d'une condition
   */
  public validateCondition(condition: string): { valid: boolean; error?: string } {
    const parsed = this.parseCondition(condition)
    return { valid: parsed.valid, error: parsed.error }
  }

  /**
   * Valide tableau de conditions
   */
  public validateConditions(conditions: ConditionalNext[]): {
    valid: boolean
    errors: string[]
  } {
    const errors: string[] = []

    for (const condition of conditions) {
      const validation = this.validateCondition(condition.condition)
      if (!validation.valid) {
        errors.push(`Invalid condition "${condition.condition}": ${validation.error}`)
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * Liste les opérateurs supportés
   */
  public getSupportedOperators(): ComparisonOperator[] {
    return ['==', '!=', '>', '<', '>=', '<=', 'exists', 'not_exists']
  }

  /**
   * Exemples de conditions valides
   */
  public getConditionExamples(): string[] {
    return [
      'user_count > 0',
      'status == "active"',
      'result.success == true',
      'error_count <= 5',
      'user_data exists',
      'optional_field not_exists',
    ]
  }
}
