import type { AIProvider, AIRequest, AIResponse } from '#bot/types/ai_types'

/**
 * Classe abstraite pour tous les providers IA
 */
export abstract class BaseProvider implements AIProvider {
  public abstract name: string
  protected config: any = {}

  abstract initialize(config: any): Promise<void>
  abstract generateResponse(request: AIRequest): Promise<AIResponse>
  abstract isAvailable(): boolean

  getUsageStats(): any {
    return {
      provider: this.name,
      isAvailable: this.isAvailable(),
    }
  }
}
