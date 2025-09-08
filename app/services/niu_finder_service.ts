// app/services/niu_finder_service.ts

import TaxpayerService from './taxpayer_service.js'
import I18nManager from '#bot/core/managers/i18n_manager'
import logger from '@adonisjs/core/services/logger'

interface NIUSearchResult {
  success: boolean
  error: boolean
  count: number
  taxpayers: any[]
  message?: string
}

interface NIUDetailsResult {
  detailsMessage: string
  taxpayerData: any
}

export default class NIUFinderService {
  private taxpayerService: TaxpayerService
  private i18n: I18nManager

  constructor() {
    this.taxpayerService = new TaxpayerService()
    this.i18n = I18nManager.getInstance()
  }

  /**
   * Recherche NIU par nom avec limite de 20 résultats
   * @param params - Paramètres de recherche
   * @returns Résultats de recherche formatés
   */
  async searchNIU(params: { name: string }, context?: any): Promise<NIUSearchResult> {
    try {
      logger.info(
        {
          searchName: params.name,
          length: params.name.length,
        },
        'Starting NIU search'
      )

      const result = await this.taxpayerService.searchInDGI({
        name: params.name.trim(),
      })

      if (!result || !result.success) {
        logger.warn(
          {
            searchName: params.name,
            result: result,
          },
          'DGI search failed'
        )

        return {
          success: false,
          error: true,
          count: 0,
          taxpayers: [],
          message: result?.message || 'Service DGI temporairement indisponible',
        }
      }

      // Récupérer et limiter les résultats à 20 max
      const allTaxpayers = result.data || []
      const limitedTaxpayers = allTaxpayers.slice(0, 20)

      // Formater les données
      const formattedTaxpayers = limitedTaxpayers.map((t: any) => ({
        nomRaisonSociale: t.nomRaisonSociale || t.nom || 'Nom non disponible',
        niu: t.niu || 'NIU non disponible',
        centre: t.centre || t.centreFiscal,
        regime: t.regime,
        activite: t.activite,
        typeContribuable: t.typeContribuable,
        etat: t.etat || 'Actif',
      }))

      logger.info(
        {
          searchName: params.name,
          totalFound: allTaxpayers.length,
          returned: formattedTaxpayers.length,
        },
        'NIU search completed'
      )

      return {
        success: true,
        error: false,
        count: allTaxpayers.length, // Nombre total trouvé
        taxpayers: formattedTaxpayers, // Max 20 résultats
        message: allTaxpayers.length > 20 ? 'Résultats limités aux 20 premiers' : undefined,
      }
    } catch (error: any) {
      logger.error(
        {
          searchName: params.name,
          error: error.message,
          stack: error.stack,
        },
        'NIU search error'
      )

      return {
        success: false,
        error: true,
        count: 0,
        taxpayers: [],
        message: 'Erreur technique lors de la recherche',
      }
    }
  }

  /**
   * Formate les détails d'un contribuable sélectionné
   * @param params - Données du contribuable et contexte
   * @returns Message formaté avec les détails
   */
  async formatNIUDetails(
    params: { selectedTaxpayer: any; searchName: string },
    context?: any
  ): Promise<NIUDetailsResult> {
    try {
      const taxpayer = params.selectedTaxpayer
      const language = context?.session?.language || 'fr'

      logger.info(
        {
          taxpayerNIU: taxpayer.niu,
          taxpayerName: taxpayer.nomRaisonSociale,
        },
        'Formatting NIU details'
      )

      // Construire le message de détails
      let detailsMessage = this.i18n.t('workflows.niu_finder.details_header', {}, language) + '\n\n'

      detailsMessage += `📋 ${this.i18n.t('workflows.niu_finder.detail_name', {}, language)}: ${taxpayer.nomRaisonSociale}\n`
      detailsMessage += `🆔 ${this.i18n.t('workflows.niu_finder.detail_niu', {}, language)}: ${taxpayer.niu}\n`

      if (taxpayer.centre) {
        detailsMessage += `🏢 ${this.i18n.t('workflows.niu_finder.detail_centre', {}, language)}: ${taxpayer.centre}\n`
      }

      if (taxpayer.regime) {
        detailsMessage += `📍 ${this.i18n.t('workflows.niu_finder.detail_regime', {}, language)}: ${taxpayer.regime}\n`
      }

      if (taxpayer.activite) {
        detailsMessage += `💼 ${this.i18n.t('workflows.niu_finder.detail_activity', {}, language)}: ${taxpayer.activite}\n`
      }

      detailsMessage += `✅ ${this.i18n.t('workflows.niu_finder.detail_status', {}, language)}: ${taxpayer.etat}\n`

      detailsMessage += '\n' + this.i18n.t('workflows.niu_finder.note_save_niu', {}, language)

      return {
        detailsMessage,
        taxpayerData: taxpayer,
      }
    } catch (error: any) {
      logger.error(
        {
          error: error.message,
          taxpayer: params.selectedTaxpayer,
        },
        'Error formatting NIU details'
      )

      const language = context?.session?.language || 'fr'

      return {
        detailsMessage: this.i18n.t('workflows.niu_finder.format_error', {}, language),
        taxpayerData: params.selectedTaxpayer,
      }
    }
  }

  /**
   * Valide le nom pour la recherche
   * @param name - Nom à valider
   * @returns true si valide, string d'erreur sinon
   */
  validateSearchName(name: string): boolean | string {
    const trimmed = name.trim()

    if (trimmed.length < 2) {
      return 'Le nom doit contenir au moins 2 caractères'
    }

    if (trimmed.length > 100) {
      return 'Le nom ne peut pas dépasser 100 caractères'
    }

    // Vérifier qu'il n'y a pas que des espaces ou des caractères spéciaux
    if (!/[a-zA-ZÀ-ÿ]/.test(trimmed)) {
      return 'Le nom doit contenir au moins une lettre'
    }

    return true
  }

  /**
   * Statistiques de recherche (pour monitoring)
   * @param searchResult - Résultat de recherche
   * @returns Statistiques formatées
   */
  getSearchStats(searchResult: NIUSearchResult): Record<string, any> {
    return {
      successful: searchResult.success,
      hasError: searchResult.error,
      resultCount: searchResult.count,
      returnedCount: searchResult.taxpayers.length,
      truncated: searchResult.count > 20,
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Nettoie et normalise le nom pour la recherche
   * @param name - Nom brut
   * @returns Nom nettoyé
   */
  private cleanSearchName(name: string): string {
    return name
      .trim()
      .replace(/\s+/g, ' ') // Normaliser les espaces multiples
      .replace(/[^\w\sÀ-ÿ\-']/gi, '') // Supprimer caractères spéciaux sauf tirets et apostrophes
  }

  /**
   * Détermine le type de recherche à effectuer
   * @param name - Nom de recherche
   * @returns Type de recherche recommandé
   */
  getSearchType(name: string): 'exact' | 'partial' | 'fuzzy' {
    const cleaned = this.cleanSearchName(name)

    if (cleaned.length <= 10) {
      return 'exact'
    } else if (cleaned.length <= 30) {
      return 'partial'
    } else {
      return 'fuzzy'
    }
  }
}
