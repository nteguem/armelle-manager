import TaxpayerService from './taxpayer_service.js'
import BotUserService from './bot_user_service.js'
import DgiScraperService from './dgi_scraper_service.js'
import type { SessionContext } from '#bot/types/bot_types'

export default class OnboardingService {
  private taxpayerService: TaxpayerService
  private botUserService: BotUserService
  private dgiScraperService: DgiScraperService

  constructor() {
    this.taxpayerService = new TaxpayerService()
    this.botUserService = new BotUserService()
    this.dgiScraperService = new DgiScraperService()
  }

  /**
   * Traite la recherche DGI et retourne le résultat approprié
   */
  async processDGISearch(
    params: {
      collect_name: string
      [key: string]: any
    },
    sessionContext?: SessionContext
  ): Promise<any> {
    try {
      const userName = params.collect_name?.trim()
      const userId = sessionContext?.userId

      if (!userName) {
        throw new Error('Nom utilisateur requis')
      }

      // 1. Mettre à jour le nom dans le profil utilisateur via BotUserService
      if (userId) {
        try {
          await this.botUserService.updateFullName(userId, userName)
        } catch (error) {
          console.error('Erreur lors de la mise à jour du nom:', error)
          // Continue même si la mise à jour échoue
        }
      }

      // 2. Recherche DGI via TaxpayerService
      const dgiResult = await this.taxpayerService.searchInDGI({ name: userName })

      // 3. Traitement des résultats
      if (!dgiResult.success || !dgiResult.data || dgiResult.data.length === 0) {
        // Aucun contribuable trouvé - créer profil partiel
        if (userId) {
          await this.createPartialProfile(userId, userName)
        }

        return {
          resultType: 'no_taxpayer',
          userName: userName,
          taxpayers: [],
        }
      }

      // Formater les données des contribuables
      const taxpayers = dgiResult.data.map((t: any) => ({
        niu: t.niu,
        name: `${t.nomRaisonSociale} ${t.prenomSigle || ''}`.trim(),
        cdi: t.cdi || '',
        centre: t.centre || '',
        etat: t.etat || '',
        data: t,
      }))

      return {
        resultType: taxpayers.length === 1 ? 'single' : 'multiple',
        userName: userName,
        taxpayers: taxpayers.slice(0, 10), // Limiter à 10 résultats
      }
    } catch (error: any) {
      console.error('Error in processDGISearch:', error)

      // En cas d'erreur, créer profil partiel
      if (sessionContext?.userId) {
        try {
          await this.createPartialProfile(sessionContext.userId, params.collect_name)
        } catch (profileError) {
          console.error('Erreur création profil partiel:', profileError)
        }
      }

      return {
        resultType: 'error',
        userName: params.collect_name,
        taxpayers: [],
        errorMessage: error.message,
      }
    }
  }

  /**
   * Confirme la sélection d'un contribuable
   */
  async confirmTaxpayerSelection(
    params: {
      selection: string
      taxpayers: any[]
      userName: string
      [key: string]: any
    },
    sessionContext?: SessionContext
  ): Promise<any> {
    const userId = sessionContext?.userId
    const selectedIndex = Number.parseInt(params.selection) - 1

    try {
      // Validation des paramètres
      if (!userId) {
        throw new Error('UserId requis')
      }

      if (!params.taxpayers || !Array.isArray(params.taxpayers)) {
        throw new Error('Liste des contribuables invalide')
      }

      // Si sélection 0 ou invalide = profil partiel
      if (params.selection === '0' || Number.isNaN(selectedIndex) || selectedIndex < 0) {
        await this.createPartialProfile(userId, params.userName)
        return {
          profileType: 'partial',
          userName: params.userName,
        }
      }

      // Récupérer le contribuable sélectionné
      const selectedTaxpayer = params.taxpayers[selectedIndex]
      if (!selectedTaxpayer || !selectedTaxpayer.data) {
        await this.createPartialProfile(userId, params.userName)
        return {
          profileType: 'partial',
          userName: params.userName,
        }
      }

      // Créer le profil complet via TaxpayerService
      const createResult = await this.createCompleteProfile(userId, selectedTaxpayer.data)

      if (createResult.success) {
        return {
          profileType: 'complete',
          userName: params.userName,
          niu: selectedTaxpayer.niu,
          taxpayerId: createResult.taxpayerId,
        }
      } else {
        // Fallback vers profil partiel si création échoue
        await this.createPartialProfile(userId, params.userName)
        return {
          profileType: 'partial',
          userName: params.userName,
          error: createResult.message,
        }
      }
    } catch (error: any) {
      console.error('Error in confirmTaxpayerSelection:', error)

      // En cas d'erreur, créer profil partiel
      if (userId) {
        try {
          await this.createPartialProfile(userId, params.userName)
        } catch (profileError) {
          console.error('Erreur création profil partiel de fallback:', profileError)
        }
      }

      return {
        profileType: 'partial',
        userName: params.userName,
        error: error.message,
      }
    }
  }

  /**
   * Recherche par NIU directement
   */
  async searchByNIU(
    params: {
      niu: string
      [key: string]: any
    },
    sessionContext?: SessionContext
  ): Promise<any> {
    try {
      const niu = params.niu?.trim()
      const userId = sessionContext?.userId

      if (!niu) {
        throw new Error('NIU requis')
      }

      // Recherche DGI via TaxpayerService
      const dgiResult = await this.taxpayerService.searchInDGI({ niu })

      if (!dgiResult.success || !dgiResult.data) {
        return {
          resultType: 'niu_not_found',
          niu: niu,
        }
      }

      // Créer directement le profil complet si utilisateur connecté
      if (userId) {
        const createResult = await this.createCompleteProfile(userId, dgiResult.data)

        if (createResult.success) {
          return {
            resultType: 'niu_verified',
            niu: niu,
            taxpayerName:
              `${dgiResult.data.nomRaisonSociale} ${dgiResult.data.prenomSigle || ''}`.trim(),
            taxpayerId: createResult.taxpayerId,
          }
        }
      }

      return {
        resultType: 'niu_found',
        niu: niu,
        taxpayerData: dgiResult.data,
        taxpayerName:
          `${dgiResult.data.nomRaisonSociale} ${dgiResult.data.prenomSigle || ''}`.trim(),
      }
    } catch (error: any) {
      console.error('Error in searchByNIU:', error)
      return {
        resultType: 'error',
        niu: params.niu,
        errorMessage: error.message,
      }
    }
  }

  /**
   * Confirme un NIU trouvé et crée le profil complet
   */
  async confirmNIU(
    params: {
      niu: string
      taxpayerData: any
      [key: string]: any
    },
    sessionContext?: SessionContext
  ): Promise<any> {
    const userId = sessionContext?.userId

    try {
      if (!userId) {
        throw new Error('Utilisateur non connecté')
      }

      if (!params.taxpayerData) {
        throw new Error('Données contribuable manquantes')
      }

      const createResult = await this.createCompleteProfile(userId, params.taxpayerData)

      if (createResult.success) {
        return {
          profileType: 'complete',
          niu: params.niu,
          taxpayerId: createResult.taxpayerId,
          taxpayerName:
            `${params.taxpayerData.nomRaisonSociale} ${params.taxpayerData.prenomSigle || ''}`.trim(),
        }
      } else {
        throw new Error(createResult.message)
      }
    } catch (error: any) {
      console.error('Error in confirmNIU:', error)
      return {
        profileType: 'error',
        niu: params.niu,
        errorMessage: error.message,
      }
    }
  }

  /**
   * Crée un profil partiel sans NIU via BotUserService
   */
  private async createPartialProfile(userId: string, fullName: string): Promise<void> {
    try {
      await this.botUserService.updateBotUser(userId, {
        fullName: fullName.trim(),
        isVerified: false,
        metadata: {
          profileType: 'partial',
          completedAt: new Date().toISOString(),
        },
      })

      console.log(`✅ Profil partiel créé pour l'utilisateur ${userId}`)
    } catch (error) {
      console.error('Erreur création profil partiel:', error)
      throw new Error(`Échec création profil partiel: ${error.message}`)
    }
  }

  /**
   * Crée un profil complet avec contribuable via TaxpayerService
   */
  private async createCompleteProfile(
    userId: string,
    taxpayerData: any
  ): Promise<{ success: boolean; message: string; taxpayerId?: string }> {
    try {
      // Validation des données DGI
      if (!taxpayerData.nomRaisonSociale) {
        throw new Error('nomRaisonSociale manquant dans les données DGI')
      }

      // 1. Vérifier si le contribuable existe déjà
      let existingTaxpayer = null
      if (taxpayerData.niu) {
        existingTaxpayer = await this.taxpayerService.findTaxpayerByNIU(taxpayerData.niu)
      }

      let taxpayer
      if (existingTaxpayer) {
        // Taxpayer existe déjà, le lier à l'utilisateur
        taxpayer = existingTaxpayer
        await this.taxpayerService.linkBotUserToTaxpayer(userId, taxpayer.id, 'owner')
        console.log(`✅ Contribuable existant lié à l'utilisateur ${userId}`)
      } else {
        // Créer nouveau contribuable via TaxpayerService avec enrichissement asynchrone
        const createResult = await this.taxpayerService.createAndLinkWithAsyncEnrichment(
          userId,
          taxpayerData
        )

        if (!createResult.success) {
          throw new Error(createResult.message)
        }

        // Récupérer le contribuable créé
        if (taxpayerData.niu) {
          taxpayer = await this.taxpayerService.findTaxpayerByNIU(taxpayerData.niu)
        }

        console.log(`✅ Nouveau contribuable créé pour l'utilisateur ${userId}`)
      }

      // 2. Mettre à jour l'utilisateur bot via BotUserService
      const fullName = `${taxpayerData.nomRaisonSociale} ${taxpayerData.prenomSigle || ''}`.trim()

      await this.botUserService.updateBotUser(userId, {
        fullName: fullName,
        isVerified: taxpayerData.niu ? true : false, // Vérifié seulement si NIU présent
        metadata: {
          profileType: 'complete',
          primaryNiu: taxpayerData.niu || null,
          completedAt: new Date().toISOString(),
          source: 'dgi_search',
        },
      })

      console.log(`✅ Profil complet créé pour l'utilisateur ${userId}`)

      return {
        success: true,
        message: 'Profil complet créé avec succès',
        taxpayerId: taxpayer?.id,
      }
    } catch (error: any) {
      console.error('Erreur création profil complet:', error)
      return {
        success: false,
        message: `Échec création profil complet: ${error.message}`,
      }
    }
  }

  /**
   * Obtient le statut de l'onboarding d'un utilisateur
   */
  async getOnboardingStatus(userId: string): Promise<any> {
    try {
      const botUser = await this.botUserService.findBotUserById(userId)

      if (!botUser) {
        return {
          status: 'not_started',
          isVerified: false,
          hasProfile: false,
        }
      }

      const taxpayers = await this.taxpayerService.getTaxpayersForBotUser(userId)
      const profileType = botUser.metadata?.profileType || 'unknown'

      return {
        status: profileType === 'complete' ? 'completed' : 'partial',
        isVerified: botUser.isVerified,
        hasProfile: true,
        fullName: botUser.fullName,
        taxpayersCount: taxpayers.length,
        primaryNiu: botUser.metadata?.primaryNiu || null,
        completedAt: botUser.metadata?.completedAt || null,
      }
    } catch (error: any) {
      console.error('Erreur obtention statut onboarding:', error)
      return {
        status: 'error',
        errorMessage: error.message,
      }
    }
  }

  /**
   * Réinitialise l'onboarding d'un utilisateur
   */
  async resetOnboarding(userId: string): Promise<{ success: boolean; message: string }> {
    try {
      // Mettre à jour l'utilisateur pour supprimer les métadonnées d'onboarding
      await this.botUserService.updateBotUser(userId, {
        isVerified: false,
        metadata: {
          profileType: null,
          primaryNiu: null,
          completedAt: null,
        },
      })

      return {
        success: true,
        message: 'Onboarding réinitialisé avec succès',
      }
    } catch (error: any) {
      console.error('Erreur réinitialisation onboarding:', error)
      return {
        success: false,
        message: `Échec réinitialisation: ${error.message}`,
      }
    }
  }

  /**
   * Nettoie les ressources
   */
  async cleanup(): Promise<void> {
    try {
      await this.taxpayerService.cleanup()
    } catch (error) {
      console.error('Erreur lors du cleanup OnboardingService:', error)
    }
  }
}
