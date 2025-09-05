import type {
  AIProvider,
  AIProviderConfig,
  AIRequest,
  AIResponse,
  DetectedIntent,
  WorkflowInfo,
} from '#bot/types/ai_types'

/**
 * Classe abstraite pour tous les providers IA
 */
export abstract class BaseProvider implements AIProvider {
  public abstract name: string
  protected config: AIProviderConfig = {
    name: '',
  }
  protected stats = {
    totalRequests: 0,
    totalTokens: 0,
    totalResponseTime: 0,
  }

  abstract initialize(config: AIProviderConfig): Promise<void>

  abstract generateResponse(request: AIRequest): Promise<AIResponse>

  abstract isAvailable(): boolean

  /**
   * Détection d'intentions par défaut (peut être override)
   */
  async detectIntents(message: string, workflows: WorkflowInfo[]): Promise<DetectedIntent[]> {
    const intents: DetectedIntent[] = []

    // Détection simple basée sur mots-clés
    for (const workflow of workflows) {
      if (!workflow.keywords) continue

      const messageLower = message.toLowerCase()
      const matches = workflow.keywords.filter((k) => messageLower.includes(k.toLowerCase()))

      if (matches.length > 0) {
        intents.push({
          workflowId: workflow.id,
          confidence: Math.min(matches.length * 0.3, 0.9),
          reason: `Mots-clés détectés: ${matches.join(', ')}`,
        })
      }
    }

    return intents.sort((a, b) => b.confidence - a.confidence)
  }

  getUsageStats() {
    return {
      totalRequests: this.stats.totalRequests,
      totalTokens: this.stats.totalTokens,
      averageResponseTime:
        this.stats.totalRequests > 0 ? this.stats.totalResponseTime / this.stats.totalRequests : 0,
    }
  }

  protected updateStats(tokens: number, responseTime: number) {
    this.stats.totalRequests++
    this.stats.totalTokens += tokens
    this.stats.totalResponseTime += responseTime
  }
}
