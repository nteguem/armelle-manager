import type { ConditionalNext } from './workflow_context.js'
import logger from '@adonisjs/core/services/logger'

export class TransitionResolver {
  public resolve(
    nextConfig: string | ConditionalNext[] | undefined,
    variables: Record<string, any>
  ): string | null {
    if (!nextConfig) {
      return null
    }

    if (typeof nextConfig === 'string') {
      return nextConfig
    }

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
        variables: JSON.stringify(variables, null, 2),
      })
    }

    return null
  }

  private evaluateCondition(condition: string, variables: Record<string, any>): boolean {
    try {
      let evaluableCondition = condition

      logger.debug('Evaluating condition', {
        condition,
        relevantVariables: this.extractRelevantVariables(condition, variables),
      })

      const variableMatches = condition.match(/\b(\w+(?:\.\w+)*)\b/g) || []

      for (const varPath of variableMatches) {
        const value = this.getNestedValue(variables, varPath)
        if (value !== undefined) {
          const jsonValue = JSON.stringify(value)
          evaluableCondition = evaluableCondition.replace(
            new RegExp(`\\b${varPath.replace('.', '\\.')}\\b`, 'g'),
            jsonValue
          )
        } else {
          logger.debug(`Variable not found: ${varPath}`, {
            availableKeys: Object.keys(variables),
          })
        }
      }

      logger.debug(`Final condition: ${evaluableCondition}`)

      const func = new Function(`
        "use strict";
        return (${evaluableCondition});
      `)

      const result = Boolean(func())
      logger.debug(`Condition result: ${condition} = ${result}`)

      return result
    } catch (error) {
      logger.warn(`Condition evaluation failed: ${condition}`, {
        error: error.message,
        availableVariables: Object.keys(variables),
      })
      return false
    }
  }

  private extractRelevantVariables(
    condition: string,
    variables: Record<string, any>
  ): Record<string, any> {
    const variableMatches = condition.match(/\b(\w+(?:\.\w+)*)\b/g) || []
    const relevant: Record<string, any> = {}

    for (const varPath of variableMatches) {
      const value = this.getNestedValue(variables, varPath)
      relevant[varPath] = value
    }

    return relevant
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined
    }, obj)
  }

  public validateCondition(condition: string): { valid: boolean; error?: string } {
    try {
      new Function(`return (${condition.replace(/\w+(?:\.\w+)*/g, 'true')})`)
      return { valid: true }
    } catch (error) {
      return {
        valid: false,
        error: `Invalid condition syntax: ${error.message}`,
      }
    }
  }
}
