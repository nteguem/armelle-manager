import { WorkflowRegistry } from '#bot/core/workflow/registry/workflow_registry'
import type { SessionContext } from '#bot/types/bot_types'
import type { AIContext, WorkflowInfo } from '#bot/types/ai_types'
import logger from '@adonisjs/core/services/logger'

export default class ContextBuilder {
  private workflowRegistry: WorkflowRegistry

  constructor() {
    this.workflowRegistry = WorkflowRegistry.getInstance()
  }

  async build(sessionContext: SessionContext): Promise<AIContext> {
    try {
      // Récupérer les workflows disponibles
      const workflows = this.getAvailableWorkflows(sessionContext)

      // Construire le profil utilisateur simple
      const userProfile = {
        id: sessionContext.userId,
        language: sessionContext.language,
        isVerified: sessionContext.isVerified,
      }

      // Contexte simple
      const context: AIContext = {
        sessionContext,
        availableWorkflows: workflows,
        userProfile,
        conversationHistory: [],
        contextData: {},
      }

      logger.debug(
        {
          sessionKey: `${sessionContext.channel}:${sessionContext.channelUserId}`,
          workflowCount: workflows.length,
        },
        'AI Context built'
      )

      return context
    } catch (error: any) {
      logger.error('Failed to build AI context:', error)

      // Contexte minimal en cas d'erreur
      return {
        sessionContext,
        availableWorkflows: [],
        userProfile: {
          id: sessionContext.userId,
          language: sessionContext.language,
          isVerified: sessionContext.isVerified,
        },
        conversationHistory: [],
        contextData: {},
      }
    }
  }

  private getAvailableWorkflows(sessionContext: SessionContext): WorkflowInfo[] {
    try {
      const workflows = this.workflowRegistry.getUserWorkflows(sessionContext)
      const lang = sessionContext.language

      return workflows.map((w) => {
        // Assertion de type pour éviter l'inférence 'never'
        const workflow = w as any

        return {
          id: workflow.id,
          name: typeof workflow.name === 'function' ? workflow.name(lang) : workflow.name,
          description:
            typeof workflow.description === 'function'
              ? workflow.description(lang)
              : workflow.description,
        }
      })
    } catch (error) {
      logger.warn('Failed to get available workflows:', error)
      return []
    }
  }
}
