import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, AIRequest, AIResponse } from '#bot/types/ai_types'
import logger from '@adonisjs/core/services/logger'

export class AnthropicProvider implements AIProvider {
  name = 'anthropic'
  private client: Anthropic | null = null
  private initialized = false

  async initialize(config: any): Promise<void> {
    try {
      if (!config.apiKey) {
        throw new Error('Anthropic API key is required')
      }

      this.client = new Anthropic({
        apiKey: config.apiKey,
      })

      this.initialized = true
      logger.info('Anthropic provider initialized')
    } catch (error: any) {
      logger.error('Failed to initialize Anthropic provider:', error)
      throw error
    }
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    if (!this.client || !this.initialized) {
      throw new Error('Anthropic provider not initialized')
    }

    try {
      const systemMessage = this.buildSystemMessage(request)
      const messages = [
        {
          role: 'user' as const,
          content: request.message,
        },
      ]

      const completion = await this.client.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 400,
        temperature: 0.3,
        system: systemMessage,
        messages: messages,
      })

      const responseText = completion.content
        .filter((block) => block.type === 'text')
        .map((block) => (block as any).text)
        .join('\n')

      return {
        message: responseText,
        confidence: 1.0,
        metadata: {
          usage: completion.usage,
        },
      }
    } catch (error: any) {
      logger.error('Anthropic API error:', error)
      throw new Error(`Anthropic API call failed: ${error.message}`)
    }
  }

  private buildSystemMessage(request: AIRequest): string {
    const language = request.context.sessionContext.language
    const workflows = this.formatWorkflows(request.context.availableWorkflows, language)

    return language === 'fr'
      ? `Tu es Armelle, assistante fiscale camerounaise.

Fonctionnalités que tu peux lancer:
${workflows}

INSTRUCTIONS STRICTES:
1. Analyse le message de l'utilisateur
2. Compare-le avec les descriptions des fonctionnalités ci-dessus
3. DÉTECTION:
   - Si le message correspond CLAIREMENT à une fonctionnalité → Réponds EXACTEMENT: "Je peux [action]. Souhaitez-vous continuer ?"
   - Si "que sais-tu faire" → Liste les fonctionnalités + "Je peux aussi répondre à vos questions sur la fiscalité camerounaise"
   - Sinon → Réponse conversationnelle normale

EXEMPLES DE DÉTECTION:
- "j'ai perdu mon NIU" → "Je peux vous aider à retrouver votre NIU. Souhaitez-vous continuer ?"
- "calcule mon IGS" → "Je peux calculer votre IGS. Souhaitez-vous continuer ?"
- "comment retrouver mon NIU" → "Je peux vous aider à retrouver votre NIU. Souhaitez-vous continuer ?"

IMPORTANT: Ne propose une fonctionnalité QUE si l'utilisateur veut FAIRE cette action.`
      : `You are Armelle, Cameroon tax assistant.

Features you can launch:
${workflows}

STRICT INSTRUCTIONS:
1. Analyze the user's message
2. Compare it with the feature descriptions above
3. DETECTION:
   - If message CLEARLY matches a feature → Respond EXACTLY: "I can [action]. Would you like to proceed?"
   - If "what can you do" → List features + "I can also answer your questions about Cameroon taxation"
   - Otherwise → Normal conversational response

DETECTION EXAMPLES:
- "I lost my NIU" → "I can help you find your NIU. Would you like to proceed?"
- "calculate my IGS" → "I can calculate your IGS. Would you like to proceed?"

IMPORTANT: Only propose a feature if the user wants to DO that action.`
  }

  private formatWorkflows(workflows: any[], language: string): string {
    return workflows
      .map((w) => {
        const name = typeof w.name === 'function' ? w.name(language) : w.name
        const desc = typeof w.description === 'function' ? w.description(language) : w.description
        return `- ${name}: ${desc}`
      })
      .join('\n')
  }

  isAvailable(): boolean {
    return this.initialized && this.client !== null
  }

  getUsageStats(): any {
    return {
      provider: this.name,
      isAvailable: this.isAvailable(),
    }
  }
}
