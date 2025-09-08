// app/bot/core/ai/providers/anthropic_provider.ts

import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, AIRequest, AIResponse } from '#bot/types/ai_types'
import logger from '@adonisjs/core/services/logger'

export class AnthropicProvider implements AIProvider {
  name = 'anthropic'
  private client: Anthropic | null = null
  private initialized = false
  private requestCount = 0
  private errorCount = 0

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
      this.requestCount++

      const language = request.context.sessionContext.language
      const systemMessage =
        language === 'fr'
          ? `Tu es Armelle, l'assistant fiscal virtuel du Cameroun. Tu dois TOUJOURS répondre en FRANÇAIS.`
          : `You are Armelle, the virtual tax assistant for Cameroon. You must ALWAYS respond in ENGLISH.`

      const completion = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: request.options?.maxTokens || 1024,
        temperature: request.options?.temperature || 0.7,
        system: systemMessage,
        messages: [
          {
            role: 'user',
            content: request.message,
          },
        ],
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
      this.errorCount++
      logger.error('Anthropic API error:', error)
      throw error
    }
  }

  isAvailable(): boolean {
    return this.initialized && this.client !== null
  }

  getUsageStats(): any {
    return {
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0,
    }
  }
}
