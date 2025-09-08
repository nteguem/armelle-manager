import BotUserService from './bot_user_service.js'
import TaxpayerService from './taxpayer_service.js'
import BotUser from '#models/bot/bot_user'
import logger from '@adonisjs/core/services/logger'

export default class OnboardingService {
  private botUserService: BotUserService
  private taxpayerService: TaxpayerService

  constructor() {
    this.botUserService = new BotUserService()
    this.taxpayerService = new TaxpayerService()
  }

  /**
   * Sauvegarde le nom
   */
  async saveName(params: { userId: string; fullName: string }): Promise<void> {
    await this.botUserService.updateFullName(params.userId, params.fullName)
  }

  /**
   * Recherche sur DGI
   */
  async searchDGI(params: { name: string }): Promise<DGISearchResult> {
    try {
      const result = await this.taxpayerService.searchInDGI({ name: params.name })

      if (!result || !result.success) {
        // Erreur DGI
        return {
          success: false,
          error: true,
          count: 0,
          taxpayers: [],
          message: 'Site DGI indisponible',
        }
      }

      // Formatter les résultats
      const taxpayers = result.data || []

      return {
        success: true,
        error: false,
        count: taxpayers.length,
        taxpayers: taxpayers.map((t: any) => ({
          nomRaisonSociale: t.nomRaisonSociale || t.nom,
          niu: t.niu,
          centre: t.centre || t.centreFiscal,
          regime: t.regime,
          activite: t.activite,
          typeContribuable: t.typeContribuable,
          etat: t.etat,
        })),
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'DGI search error')

      return {
        success: false,
        error: true,
        count: 0,
        taxpayers: [],
        message: 'Erreur technique',
      }
    }
  }

  /**
   * Lie un taxpayer
   */
  async linkTaxpayer(params: {
    userId: string
    taxpayerData: any
    userName: string
  }): Promise<any> {
    try {
      if (!params.taxpayerData) {
        return { success: false }
      }

      // Créer et lier le taxpayer
      const result = await this.taxpayerService.createAndLinkWithAsyncEnrichment(
        params.userId,
        params.taxpayerData
      )

      if (result.success) {
        // Récupérer le taxpayer créé pour avoir son ID
        const taxpayer = await this.taxpayerService.findTaxpayerByNIU(params.taxpayerData.niu)

        if (taxpayer) {
          // Lier comme owner
          await this.taxpayerService.linkBotUserToTaxpayer(params.userId, taxpayer.id, 'owner')
        }

        return {
          success: true,
          ...params.taxpayerData,
        }
      }

      return { success: false }
    } catch (error: any) {
      logger.error({ error: error.message }, 'Link taxpayer error')
      return { success: false }
    }
  }

  /**
   * Finalise l'onboarding
   */
  async finalizeOnboarding(params: {
    userId: string
    hasProfile: boolean
    userName: string
    taxpayerData?: any
    searchResult?: any
  }): Promise<any> {
    try {
      // Marquer comme vérifié
      const botUser = await BotUser.find(params.userId)
      if (botUser) {
        botUser.isVerified = true
        await botUser.save()
      }

      // Détecter si c'était une erreur DGI
      const dgiError = params.searchResult?.error === true

      return {
        success: true,
        hasProfile: params.hasProfile,
        userName: params.userName,
        taxpayerData: params.taxpayerData,
        dgiError: dgiError,
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'Finalize error')
      return {
        success: false,
        hasProfile: false,
        userName: params.userName,
        dgiError: true,
      }
    }
  }
}

interface DGISearchResult {
  success: boolean
  error: boolean
  count: number
  taxpayers: any[]
  message?: string
}
