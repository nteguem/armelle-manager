// app/bot/core/workflow/registry/workflow_registry.ts

import type { Workflow, WorkflowDefinition, WorkflowType } from '#bot/contracts/workflow.contract'
import type { SessionContext } from '#bot/types/bot_types'
import { WorkflowPriority } from '#bot/contracts/workflow.contract'
import logger from '@adonisjs/core/services/logger'

/**
 * Registre centralisé des workflows
 * Gère les workflows système et utilisateur
 */
export class WorkflowRegistry {
  private static instance: WorkflowRegistry

  // Séparation claire entre workflows système et utilisateur
  private systemWorkflows: Map<string, WorkflowRegistration> = new Map()
  private userWorkflows: Map<string, WorkflowRegistration> = new Map()

  private constructor() {}

  public static getInstance(): WorkflowRegistry {
    if (!WorkflowRegistry.instance) {
      WorkflowRegistry.instance = new WorkflowRegistry()
    }
    return WorkflowRegistry.instance
  }

  /**
   * Enregistre un workflow
   */
  register(WorkflowClass: new () => Workflow): void {
    try {
      const instance = new WorkflowClass()
      const definition = instance.getDefinition()

      const registration: WorkflowRegistration = {
        id: definition.id,
        type: definition.type,
        priority: definition.priority,
        WorkflowClass,
        definition,
        enabled: true,
      }

      // Stocker selon le type
      if (definition.type === 'system') {
        this.systemWorkflows.set(definition.id, registration)
        logger.info(
          {
            workflowId: definition.id,
            type: 'system',
            priority: definition.priority,
          },
          'System workflow registered'
        )
      } else {
        this.userWorkflows.set(definition.id, registration)
        logger.info(
          {
            workflowId: definition.id,
            type: 'user',
            priority: definition.priority,
          },
          'User workflow registered'
        )
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to register workflow')
      throw error
    }
  }

  /**
   * Obtient un workflow par ID
   */
  get(workflowId: string): Workflow | undefined {
    const registration = this.systemWorkflows.get(workflowId) || this.userWorkflows.get(workflowId)

    if (!registration || !registration.enabled) {
      return undefined
    }

    return new registration.WorkflowClass()
  }

  /**
   * Obtient tous les workflows d'un type
   */
  getByType(type: WorkflowType): WorkflowInfo[] {
    const workflows = type === 'system' ? this.systemWorkflows : this.userWorkflows

    return Array.from(workflows.values())
      .filter((reg) => reg.enabled)
      .map((reg) => this.toWorkflowInfo(reg))
      .sort((a, b) => b.priority - a.priority) // Trier par priorité
  }

  /**
   * Obtient les workflows utilisateur disponibles
   */
  getUserWorkflows(session: SessionContext): WorkflowInfo[] {
    return Array.from(this.userWorkflows.values())
      .filter((reg) => reg.enabled)
      .filter((reg) => {
        const instance = new reg.WorkflowClass()
        return instance.canActivate(session)
      })
      .map((reg) => this.toWorkflowInfo(reg))
      .sort((a, b) => b.priority - a.priority)
  }

  /**
   * Trouve les workflows activables par commande
   */
  findByCommand(command: string, session: SessionContext): WorkflowInfo[] {
    const results: WorkflowInfo[] = []

    // Chercher dans tous les workflows
    const allWorkflows = [
      ...Array.from(this.systemWorkflows.values()),
      ...Array.from(this.userWorkflows.values()),
    ]

    for (const reg of allWorkflows) {
      if (!reg.enabled) continue

      const activation = reg.definition.activation
      if (activation?.commands?.includes(command)) {
        const instance = new reg.WorkflowClass()
        if (instance.canActivate(session)) {
          results.push(this.toWorkflowInfo(reg))
        }
      }
    }

    return results.sort((a, b) => b.priority - a.priority)
  }

  /**
   * Trouve les workflows activables par mots-clés
   */
  findByKeywords(text: string, session: SessionContext): WorkflowInfo[] {
    const results: WorkflowInfo[] = []
    const textLower = text.toLowerCase()

    // Chercher dans les workflows utilisateur uniquement
    for (const reg of this.userWorkflows.values()) {
      if (!reg.enabled) continue

      const activation = reg.definition.activation
      if (activation?.keywords) {
        const matchCount = activation.keywords.filter((kw) =>
          textLower.includes(kw.toLowerCase())
        ).length

        if (matchCount > 0) {
          const instance = new reg.WorkflowClass()
          if (instance.canActivate(session)) {
            const info = this.toWorkflowInfo(reg)
            info.relevance = matchCount // Ajouter un score de pertinence
            results.push(info)
          }
        }
      }
    }

    // Trier par pertinence puis priorité
    return results.sort((a, b) => {
      if (a.relevance !== b.relevance) {
        return (b.relevance || 0) - (a.relevance || 0)
      }
      return b.priority - a.priority
    })
  }

  /**
   * Vérifie si un workflow système critique est actif
   */
  hasCriticalSystemWorkflow(session: SessionContext): boolean {
    // Vérifier si un workflow système critique peut être activé
    for (const reg of this.systemWorkflows.values()) {
      if (reg.priority >= WorkflowPriority.CRITICAL && reg.enabled) {
        const instance = new reg.WorkflowClass()
        if (instance.canActivate(session)) {
          return true
        }
      }
    }
    return false
  }

  /**
   * Active/désactive un workflow
   */
  setEnabled(workflowId: string, enabled: boolean): void {
    const registration = this.systemWorkflows.get(workflowId) || this.userWorkflows.get(workflowId)

    if (registration) {
      registration.enabled = enabled
      logger.info(
        {
          workflowId,
          enabled,
        },
        'Workflow state changed'
      )
    }
  }

  /**
   * Vérifie si un workflow existe
   */
  exists(workflowId: string): boolean {
    return this.systemWorkflows.has(workflowId) || this.userWorkflows.has(workflowId)
  }

  /**
   * Obtient les statistiques
   */
  getStats(): RegistryStats {
    return {
      systemWorkflows: {
        total: this.systemWorkflows.size,
        enabled: Array.from(this.systemWorkflows.values()).filter((r) => r.enabled).length,
        workflows: Array.from(this.systemWorkflows.keys()),
      },
      userWorkflows: {
        total: this.userWorkflows.size,
        enabled: Array.from(this.userWorkflows.values()).filter((r) => r.enabled).length,
        workflows: Array.from(this.userWorkflows.keys()),
      },
    }
  }

  /**
   * Vide le registre (utile pour les tests)
   */
  clear(): void {
    this.systemWorkflows.clear()
    this.userWorkflows.clear()
    logger.info('Workflow registry cleared')
  }

  /**
   * Convertit une registration en WorkflowInfo
   */
  private toWorkflowInfo(reg: WorkflowRegistration): WorkflowInfo {
    const language = 'fr' // Par défaut, sera overridé selon le contexte

    return {
      id: reg.id,
      type: reg.type,
      priority: reg.priority,
      name:
        typeof reg.definition.name === 'function'
          ? reg.definition.name(language as any)
          : reg.definition.name,
      description: reg.definition.description
        ? typeof reg.definition.description === 'function'
          ? reg.definition.description(language as any)
          : reg.definition.description
        : undefined,
      version: reg.definition.version,
      keywords: reg.definition.activation?.keywords,
      commands: reg.definition.activation?.commands,
      relevance: 0,
    }
  }
}

/**
 * Structure d'enregistrement interne
 */
interface WorkflowRegistration {
  id: string
  type: WorkflowType
  priority: WorkflowPriority
  WorkflowClass: new () => Workflow
  definition: WorkflowDefinition
  enabled: boolean
}

/**
 * Informations publiques d'un workflow
 */
export interface WorkflowInfo {
  id: string
  type: WorkflowType
  priority: WorkflowPriority
  name: string
  description?: string
  version: string
  keywords?: string[]
  commands?: string[]
  relevance?: number
}

/**
 * Statistiques du registre
 */
interface RegistryStats {
  systemWorkflows: {
    total: number
    enabled: number
    workflows: string[]
  }
  userWorkflows: {
    total: number
    enabled: number
    workflows: string[]
  }
}
