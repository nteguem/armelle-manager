import DgiScraperService from '#services/dgi_scraper_service'
import TaxpayerService from '#services/taxpayer_service'
import BotUserService from '#services/bot_user_service'

export default class OnboardingService {
  private dgiScraperService: DgiScraperService
  private taxpayerService: TaxpayerService
  private botUserService: BotUserService

  constructor() {
    this.dgiScraperService = new DgiScraperService()
    this.taxpayerService = new TaxpayerService()
    this.botUserService = new BotUserService()
  }

  async processUserRegistration(
    botUserId: string,
    userName: string
  ): Promise<{
    success: boolean
    messageType: 'completion' | 'selection' | 'error' | 'retry'
    data?: any
    messageKey?: string
    messageParams?: Record<string, any>
  }> {
    try {
      // 1. Mettre à jour fullName immédiatement
      await this.botUserService.updateFullName(botUserId, userName)

      // 2. Recherche DGI
      const dgiResult = await this.dgiScraperService.rechercherParNom(userName)

      // 3. Traitement selon résultat DGI
      if (!dgiResult.success || dgiResult.type === 'erreur') {
        return {
          success: true,
          messageType: 'completion',
          messageKey: 'workflows.onboarding.completion_name_only',
          messageParams: { name: userName },
        }
      }

      if (dgiResult.type === 'aucune') {
        return {
          success: true,
          messageType: 'completion',
          messageKey: 'workflows.onboarding.completion_name_only',
          messageParams: { name: userName },
        }
      }

      // Cas unique ou multiple
      if (dgiResult.type === 'unique' || dgiResult.type === 'multiple') {
        const taxpayers = Array.isArray(dgiResult.data) ? dgiResult.data : [dgiResult.data]
        const limitedTaxpayers = taxpayers.slice(0, 10)

        if (taxpayers.length > 10) {
          return {
            success: true,
            messageType: 'retry',
            messageKey: 'workflows.onboarding.too_many_results',
            messageParams: { count: taxpayers.length },
          }
        }

        return {
          success: true,
          messageType: 'selection',
          data: {
            taxpayers: limitedTaxpayers,
            botUserId,
            userName,
          },
          messageKey: 'workflows.onboarding.selection_menu',
        }
      }

      return {
        success: true,
        messageType: 'completion',
        messageKey: 'workflows.onboarding.completion_name_only',
        messageParams: { name: userName },
      }
    } catch (error) {
      console.error('Error in processUserRegistration:', error)
      return {
        success: true,
        messageType: 'completion',
        messageKey: 'workflows.onboarding.completion_name_only',
        messageParams: { name: userName },
      }
    }
  }

  async linkSelectedTaxpayer(
    botUserId: string,
    userName: string,
    selectedIndex: number,
    taxpayers: any[]
  ): Promise<{
    success: boolean
    messageKey: string
    messageParams?: Record<string, any>
  }> {
    try {
      if (selectedIndex === 0) {
        return {
          success: true,
          messageKey: 'workflows.onboarding.completion_name_only',
          messageParams: { name: userName },
        }
      }

      const selectedTaxpayer = taxpayers[selectedIndex - 1]
      if (!selectedTaxpayer) {
        return {
          success: false,
          messageKey: 'workflows.onboarding.invalid_selection',
        }
      }

      const existingTaxpayer = await this.taxpayerService.findTaxpayerByNIU(selectedTaxpayer.niu)

      if (existingTaxpayer) {
        await this.taxpayerService.linkBotUserToTaxpayer(botUserId, existingTaxpayer.id, 'owner')
        await this.botUserService.markAsVerified(botUserId)

        return {
          success: true,
          messageKey: 'workflows.onboarding.completion_existing_taxpayer',
          messageParams: { name: userName, niu: selectedTaxpayer.niu },
        }
      }

      await this.taxpayerService.createAndLinkWithAsyncEnrichment(botUserId, selectedTaxpayer)
      await this.botUserService.markAsVerified(botUserId)

      return {
        success: true,
        messageKey: 'workflows.onboarding.completion_new_taxpayer',
        messageParams: { name: userName },
      }
    } catch (error) {
      console.error('Error in linkSelectedTaxpayer:', error)
      return {
        success: true,
        messageKey: 'workflows.onboarding.completion_name_only',
        messageParams: { name: userName },
      }
    }
  }
}
