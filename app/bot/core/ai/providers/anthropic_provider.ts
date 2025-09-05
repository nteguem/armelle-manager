// app/bot/core/ai/providers/anthropic_provider.ts

import { BaseProvider } from './base_provider.js'
import type { AIProviderConfig, AIRequest, AIResponse } from '#bot/types/ai_types'

export class AnthropicProvider extends BaseProvider {
  public name = 'anthropic'
  private apiKey: string = ''
  private model: string = 'claude-3-haiku-20240307'
  private baseUrl: string = 'https://api.anthropic.com/v1/messages'

  async initialize(config: AIProviderConfig): Promise<void> {
    this.config = config
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || ''
    this.model = config.model || this.model

    if (!this.apiKey) {
      throw new Error('Anthropic API key is required')
    }
  }

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now()

    try {
      // Construire le prompt système
      const systemPrompt = this.buildSystemPrompt(request)

      // Construire les messages au format Anthropic
      // IMPORTANT: Anthropic nécessite role 'user' ou 'assistant', pas 'system'
      const messages = []

      // Ajouter l'historique de conversation
      for (const msg of request.context.conversationHistory.slice(-5)) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({
            role: msg.role,
            content: msg.content,
          })
        }
      }

      // Ajouter le message actuel
      messages.push({
        role: 'user',
        content: request.message,
      })

      // S'assurer qu'on commence par un message 'user'
      if (messages.length === 0 || messages[0].role !== 'user') {
        messages.unshift({
          role: 'user',
          content: 'Bonjour',
        })
      }

      // Appel API Anthropic
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.config.maxTokens || 500,
          temperature: this.config.temperature || 0.7,
          system: systemPrompt,
          messages: messages,
        }),
      })

      if (!response.ok) {
        const errorData = await response.text()
        console.error('Anthropic API error response:', errorData)
        throw new Error(`Anthropic API error: ${response.status}`)
      }

      const data = await response.json()

      // Extraire le texte de la réponse
      const responseText = data.content?.[0]?.text || "Désolé, je n'ai pas pu générer une réponse."

      // Détecter les intentions si demandé
      let intents
      if (request.options?.detectIntents) {
        intents = await this.detectIntents(request.message, request.context.availableWorkflows)
      }

      // Stats
      const responseTime = Date.now() - startTime
      this.updateStats(data.usage?.input_tokens || 0, responseTime)

      return {
        message: responseText,
        intents,
        metadata: {
          tokensUsed: data.usage?.input_tokens,
          processingTime: responseTime,
          provider: this.name,
        },
      }
    } catch (error: any) {
      console.error('Anthropic provider error:', error)
      throw new Error(`Failed to generate response: ${error.message}`)
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey
  }

  private buildSystemPrompt(request: AIRequest): string {
    const { userProfile, availableWorkflows, language } = request.context

    const workflowList = availableWorkflows
      .map((w) => `- ${w.name}: ${w.description || w.id}`)
      .join('\n')

    const prompt =
      language === 'fr'
        ? `Tu es Armelle, l'assistant fiscal du Cameroun. Tu aides UNIQUEMENT avec les questions fiscales camerounaises.

CONTEXTE FISCAL CAMEROUNAIS IMPORTANT :
- IGS = Impôt Général Synthétique (pour les petites entreprises, chiffre d'affaires < 10 millions FCFA)
- IS = Impôt sur les Sociétés (30% du bénéfice pour les entreprises)
- IRPP = Impôt sur le Revenu des Personnes Physiques (sur les salaires)
- TVA = Taxe sur la Valeur Ajoutée (19.25%)
- NIU = Numéro d'Identification Unique du contribuable
- DGI = Direction Générale des Impôts
- CDI = Centre des Impôts

Utilisateur : ${userProfile.type === 'complete' ? `${userProfile.fullName} (NIU: ${userProfile.niu})` : 'Profil partiel'}
Date : ${request.context.currentDate}

Fonctionnalités disponibles (NE JAMAIS faire les calculs toi-même, suggère ces outils) :
${workflowList}

RÈGLES STRICTES :
1. Réponds UNIQUEMENT aux questions fiscales camerounaises
2. Pour l'IGS (Impôt Général Synthétique), explique que c'est pour les petites entreprises mais NE CALCULE JAMAIS - suggère le workflow de calcul
3. Pour toute demande de calcul, suggère le workflow approprié au lieu de calculer
4. Pour les questions non-fiscales : "Je suis spécialisé uniquement dans la fiscalité camerounaise."
5. Sois TRÈS CONCIS - maximum 2-3 phrases
6. Utilise les termes fiscaux camerounais corrects

Réponds en français de manière très concise.`
        : `You are Armelle, Cameroon's tax assistant. You help ONLY with Cameroonian tax matters.

IMPORTANT CAMEROONIAN TAX CONTEXT:
- IGS = General Synthetic Tax (for small businesses, turnover < 10 million FCFA)
- IS = Corporate Tax (30% of profit)
- IRPP = Personal Income Tax (on salaries)
- VAT = Value Added Tax (19.25%)
- NIU = Unique Taxpayer Identification Number
- DGI = General Directorate of Taxes
- CDI = Tax Center

User: ${userProfile.type === 'complete' ? `${userProfile.fullName} (NIU: ${userProfile.niu})` : 'Partial profile'}
Date: ${request.context.currentDate}

Available features (NEVER calculate yourself, suggest these tools):
${workflowList}

STRICT RULES:
1. Answer ONLY Cameroonian tax questions
2. For IGS (General Synthetic Tax), explain it's for small businesses but NEVER CALCULATE - suggest the calculation workflow
3. For any calculation request, suggest the appropriate workflow instead of calculating
4. For non-tax questions: "I specialize only in Cameroonian taxation."
5. Be VERY CONCISE - maximum 2-3 sentences
6. Use correct Cameroonian tax terms

Respond in English very concisely.`

    return prompt
  }
}
