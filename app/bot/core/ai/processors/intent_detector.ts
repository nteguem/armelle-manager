// app/bot/core/ai/processors/intent_detector.ts

import type { DetectedIntent, WorkflowInfo } from '#bot/types/ai_types'

/**
 * Détecte les intentions dans les messages
 */
export default class IntentDetector {
  private readonly CONFIDENCE_THRESHOLD = 0.7

  /**
   * Analyse un message pour détecter des intentions
   * Version simple basée sur mots-clés, l'IA fera le travail complexe
   */
  async detect(message: string, workflows: WorkflowInfo[]): Promise<DetectedIntent[]> {
    const intents: DetectedIntent[] = []
    const messageLower = message.toLowerCase()

    for (const workflow of workflows) {
      if (!workflow.keywords) continue

      // Simple vérification de présence de mots-clés
      const matches = workflow.keywords.filter((k) => messageLower.includes(k.toLowerCase()))

      if (matches.length > 0) {
        intents.push({
          workflowId: workflow.id,
          confidence: Math.min(matches.length * 0.3, 0.9),
          reason: `Keywords: ${matches.join(', ')}`,
        })
      }
    }

    return intents
      .filter((i) => i.confidence >= this.CONFIDENCE_THRESHOLD)
      .sort((a, b) => b.confidence - a.confidence)
  }
}
