// app/bot/core/ai/processors/context_builder.ts

import { WorkflowRegistry } from '#bot/core/workflow/registry/workflow_registry'
import type { SessionContext } from '#bot/types/bot_types'
import type { AIContext, WorkflowInfo } from '#bot/types/ai_types'

export default class ContextBuilder {
  private workflowRegistry: WorkflowRegistry

  constructor() {
    this.workflowRegistry = WorkflowRegistry.getInstance()
  }

  async build(sessionContext: SessionContext): Promise<AIContext> {
    const workflows = this.getAvailableWorkflows(sessionContext)

    return {
      sessionContext,
      availableWorkflows: workflows,
      userProfile: {
        id: sessionContext.userId,
        language: sessionContext.language,
        isVerified: sessionContext.isVerified,
      },
      conversationHistory: [],
      contextData: sessionContext.workflowData || {},
    }
  }

  private getAvailableWorkflows(sessionContext: SessionContext): WorkflowInfo[] {
    const workflows = this.workflowRegistry.getUserWorkflows(sessionContext)

    return workflows.map((w) => {
      // Garder les propriétés telles quelles (fonctions ou strings)
      return {
        id: w.id,
        name: w.name,
        description: w.description,
        keywords: [],
      }
    })
  }
}
