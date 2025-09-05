// app/bot/core/ai/processors/context_builder.ts

import { WorkflowRegistry } from '#bot/core/workflow/registry/workflow_registry'
import BotMessage from '#models/bot/bot_message'
import BotUser from '#models/bot/bot_user'
import type { AIContext, AIMessage, WorkflowInfo } from '#bot/types/ai_types'
import type { SessionContext } from '#bot/types/bot_types'

/**
 * Construit le contexte pour l'IA
 */
export default class ContextBuilder {
  private workflowRegistry: WorkflowRegistry

  constructor() {
    this.workflowRegistry = WorkflowRegistry.getInstance()
  }

  /**
   * Construit le contexte complet pour l'IA
   */
  async build(sessionContext: SessionContext): Promise<AIContext> {
    // Récupérer le profil utilisateur
    const userProfile = await this.getUserProfile(sessionContext)

    // Récupérer l'historique de conversation
    const conversationHistory = await this.getConversationHistory(sessionContext)

    // Récupérer les workflows disponibles
    const availableWorkflows = this.getAvailableWorkflows()

    return {
      sessionContext,
      userProfile,
      conversationHistory,
      availableWorkflows,
      currentDate: new Date().toLocaleDateString('fr-FR'),
      language: sessionContext.language,
    }
  }

  /**
   * Récupère le profil utilisateur
   */
  private async getUserProfile(sessionContext: SessionContext) {
    const user = await BotUser.find(sessionContext.userId)

    if (!user) {
      return {
        type: 'partial' as const,
        fullName: undefined,
        niu: undefined,
      }
    }

    const metadata = user.metadata as any

    return {
      type: user.isVerified ? ('complete' as const) : ('partial' as const),
      fullName: metadata?.fullName,
      niu: metadata?.primaryNiu,
    }
  }

  /**
   * Récupère l'historique de conversation (5 derniers échanges)
   */
  private async getConversationHistory(sessionContext: SessionContext): Promise<AIMessage[]> {
    const messages = await BotMessage.query()
      .where('botUserId', sessionContext.userId)
      // PAS de .where('channel') car la colonne n'existe pas
      .orderBy('createdAt', 'desc')
      .limit(10)

    const history: AIMessage[] = []

    for (const msg of messages.reverse()) {
      history.push({
        role: msg.direction === 'in' ? 'user' : 'assistant',
        content: msg.content,
        timestamp: msg.createdAt.toJSDate(),
      })
    }

    return history.slice(-5) // Garder seulement les 5 derniers
  }

  /**
   * Récupère les workflows disponibles
   */
  private getAvailableWorkflows(): WorkflowInfo[] {
    const workflows = this.workflowRegistry.listAvailable()

    return workflows
      .filter((w) => w.id !== 'onboarding') // Pas l'onboarding dans les suggestions
      .map((w) => ({
        id: w.id,
        name: w.description || w.id,
        description: w.description,
        keywords: this.getWorkflowKeywords(w.id),
      }))
  }

  /**
   * Retourne les mots-clés pour la détection d'intention
   */
  private getWorkflowKeywords(workflowId: string): string[] {
    const keywordMap: Record<string, string[]> = {
      'igs-calculator': ['igs', 'salaire', 'impôt', 'calculer', 'calcul'],
      'tax-declaration': ['déclarer', 'déclaration', 'télédéclaration'],
      'tax-schedule': ['échéance', 'calendrier', 'date', 'paiement'],
      'registration-request': ['immatriculation', 'entreprise', 'créer', 'enregistrer'],
    }

    return keywordMap[workflowId] || []
  }
}
