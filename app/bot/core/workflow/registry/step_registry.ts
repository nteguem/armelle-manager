import type { BaseStep } from '../steps/base_step.js'
import { InputStep } from '../steps/input_step.js'
import { ServiceStep } from '../steps/service_step.js'
import { MenuStep } from '../steps/menu_step.js'
import logger from '@adonisjs/core/services/logger'
import { MessageStep } from '../steps/message_step.js'

/**
 * Métadonnées type d'étape
 */
interface StepTypeMetadata {
  handler: BaseStep
  registeredAt: Date
  description?: string
}

/**
 * Registre des types d'étapes
 * Catalogue handlers pour chaque type d'étape
 */
export class StepRegistry {
  private static instance: StepRegistry
  private stepHandlers: Map<string, StepTypeMetadata> = new Map()

  private constructor() {
    this.registerDefaultStepTypes()
  }

  public static getInstance(): StepRegistry {
    if (!StepRegistry.instance) {
      StepRegistry.instance = new StepRegistry()
    }
    return StepRegistry.instance
  }

  /**
   * Enregistre types d'étapes par défaut
   */
  private registerDefaultStepTypes(): void {
    this.register(new InputStep(), {
      description: 'Étape de saisie utilisateur avec validation',
    })

    this.register(new ServiceStep(), {
      description: "Étape d'appel de service métier",
    })

    this.register(new MenuStep(), {
      description: 'Étape de menu avec options statiques ou dynamiques',
    })

    this.register(new MessageStep(), {
      description: 'Étape de message simple (fin de workflow)',
    })

    logger.info('Default step types registered', {
      types: this.getRegisteredTypes(),
    })
  }

  /**
   * Enregistre un nouveau type d'étape
   */
  public register(handler: BaseStep, options: { description?: string } = {}): void {
    // Valider handler
    if (!handler.type) {
      throw new Error('Step handler must have a type property')
    }

    if (typeof handler.execute !== 'function') {
      throw new Error('Step handler must implement execute method')
    }

    // Enregistrer
    this.stepHandlers.set(handler.type, {
      handler,
      registeredAt: new Date(),
      description: options.description,
    })

    logger.info(`Step type registered: ${handler.type}`, {
      description: options.description,
    })
  }

  /**
   * Récupère handler pour un type d'étape
   */
  public getHandler(stepType: string): BaseStep | undefined {
    const metadata = this.stepHandlers.get(stepType)
    return metadata?.handler
  }

  /**
   * Vérifie si type d'étape est supporté
   */
  public hasHandler(stepType: string): boolean {
    return this.stepHandlers.has(stepType)
  }

  /**
   * Liste types d'étapes enregistrés
   */
  public getRegisteredTypes(): string[] {
    return Array.from(this.stepHandlers.keys())
  }

  /**
   * Récupère métadonnées type d'étape
   */
  public getStepTypeMetadata(stepType: string): StepTypeMetadata | undefined {
    return this.stepHandlers.get(stepType)
  }

  /**
   * Liste détaillée types d'étapes
   */
  public listStepTypes(): {
    type: string
    description?: string
    registeredAt: Date
    handlerClass: string
  }[] {
    return Array.from(this.stepHandlers.entries()).map(([type, metadata]) => ({
      type,
      description: metadata.description,
      registeredAt: metadata.registeredAt,
      handlerClass: metadata.handler.constructor.name,
    }))
  }

  /**
   * Désenregistre un type d'étape
   */
  public unregister(stepType: string): boolean {
    const removed = this.stepHandlers.delete(stepType)
    if (removed) {
      logger.info(`Step type unregistered: ${stepType}`)
    }
    return removed
  }

  /**
   * Valide configuration étape selon son type
   */
  public validateStepConfig(
    stepType: string,
    config: Record<string, any>
  ): { valid: boolean; error?: string } {
    const handler = this.getHandler(stepType)
    if (!handler) {
      return { valid: false, error: `Unknown step type: ${stepType}` }
    }

    return handler.validateConfig(config)
  }

  /**
   * Statistiques registre
   */
  public getStats(): {
    totalStepTypes: number
    stepTypesByCategory: Record<string, string[]>
    oldestStepType?: string
    newestStepType?: string
  } {
    const stepTypes = Array.from(this.stepHandlers.entries())

    // Catégoriser par type
    const categories: Record<string, string[]> = {
      interaction: [],
      processing: [],
      navigation: [],
      other: [],
    }

    let oldest: { type: string; date: Date } | undefined
    let newest: { type: string; date: Date } | undefined

    for (const [type, metadata] of stepTypes) {
      // Catégorisation basique
      if (['input', 'menu'].includes(type)) {
        categories.interaction.push(type)
      } else if (['service', 'calculation'].includes(type)) {
        categories.processing.push(type)
      } else if (['redirect', 'condition'].includes(type)) {
        categories.navigation.push(type)
      } else {
        categories.other.push(type)
      }

      // Dates
      if (!oldest || metadata.registeredAt < oldest.date) {
        oldest = { type, date: metadata.registeredAt }
      }
      if (!newest || metadata.registeredAt > newest.date) {
        newest = { type, date: metadata.registeredAt }
      }
    }

    return {
      totalStepTypes: stepTypes.length,
      stepTypesByCategory: categories,
      oldestStepType: oldest?.type,
      newestStepType: newest?.type,
    }
  }
}
