import type { HttpContext } from '@adonisjs/core/http'
import BaseController from '#controllers/base_controller'
import { ErrorCodes } from '#services/response_formatter'
import TaxpayerService from '#services/taxpayer_service'
import User from '#models/user'

export default class TaxPayerController extends BaseController {
  private taxpayerService: TaxpayerService

  constructor() {
    super()
    this.taxpayerService = new TaxpayerService()
  }

  /**
   * Récupère la liste paginée des contribuables avec support des filtres multiples
   *
   * @description Endpoint principal pour récupérer les contribuables avec filtrage avancé.
   * Supporte les filtres multiples sous forme de tableaux pour une recherche flexible.
   *
   * @param ctx - Contexte HTTP contenant la requête et la réponse
   * @returns Promise<Response> - Liste paginée des contribuables avec métadonnées
   *
   * @example
   * GET /taxpayers?centre[]=Centre Nord&centre[]=Douala&etat[]=Actif
   * GET /taxpayers?centre=Centre Nord,Douala&page=1&limit=20
   */
  async index(ctx: HttpContext) {
    const { request } = ctx

    try {
      const page = request.input('page', 1)
      const limit = Math.min(request.input('limit', 20), 100)

      /**
       * Interface pour les filtres de recherche avec support des types multiples
       */
      interface SearchFilters {
        search?: string
        type_contribuable?: string | string[]
        etat?: string | string[]
        centre?: string | string[]
        regime?: string | string[]
        phone_number?: string
        source?: string | string[]
        created_by_type?: string | string[]
        sort_by?: string
        sort_order?: string
      }

      // Récupération des filtres avec typage strict
      const filters: SearchFilters = request.only([
        'search',
        'type_contribuable', // Support multi-valeurs : types de contribuables
        'etat', // Support multi-valeurs : états des contribuables
        'centre', // Support multi-valeurs : centres fiscaux
        'regime', // Support multi-valeurs : régimes fiscaux
        'phone_number', // Recherche simple par numéro de téléphone
        'source', // Support multi-valeurs : sources de création
        'created_by_type', // Support multi-valeurs : types de créateurs
        'sort_by', // Champ de tri
        'sort_order', // Ordre de tri (asc/desc)
      ])

      // Traitement des paramètres de requête avec notation tableau (key[])
      // Convertit les paramètres comme centre[]=val1&centre[]=val2 en tableau
      const filterKeys = Object.keys(filters) as Array<keyof SearchFilters>
      filterKeys.forEach((key) => {
        const arrayValue = request.input(`${key}[]`)
        if (arrayValue) {
          ;(filters as any)[key] = Array.isArray(arrayValue) ? arrayValue : [arrayValue]
        }
      })

      // Exécution de la recherche avec filtres normalisés
      const taxpayers = await this.taxpayerService.searchTaxpayersWithNormalizedFilters(filters, {
        page,
        limit,
      })
      const paginatedData = taxpayers.toJSON()

      // Préparation des métadonnées de pagination étendues
      interface ExtendedPaginationMeta {
        current_page: number
        total_pages: number
        per_page: number
        total_items: number
        applied_filters?: SearchFilters
      }

      const paginationMeta: ExtendedPaginationMeta = {
        current_page: paginatedData.meta.currentPage,
        total_pages: paginatedData.meta.lastPage,
        per_page: paginatedData.meta.perPage,
        total_items: paginatedData.meta.total,
        applied_filters: filters, // Informations sur les filtres appliqués pour le frontend
      }

      return this.paginated(
        ctx,
        paginatedData.data,
        paginationMeta,
        'Taxpayers retrieved successfully'
      )
    } catch (error: any) {
      console.error('Error fetching taxpayers:', error)
      return this.error(ctx, 'Failed to fetch taxpayers', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  /**
   * Crée un nouveau contribuable avec validation stricte
   *
   * @description Endpoint pour créer un contribuable. Le centre est maintenant obligatoire.
   *
   * @param ctx - Contexte HTTP contenant les données du contribuable
   * @returns Promise<Response> - Contribuable créé ou erreurs de validation
   */
  async store(ctx: HttpContext) {
    const { request } = ctx
    try {
      const payload = request.only([
        'niu',
        'nomRaisonSociale',
        'prenomSigle',
        'numeroCniRc',
        'activite',
        'regime',
        'centre', // ⭐ OBLIGATOIRE maintenant
        'etat',
        'phoneNumber',
        'dateNaissance',
      ])

      const errors: any = {}

      // Validation nom/raison sociale (obligatoire)
      if (!payload.nomRaisonSociale || !payload.nomRaisonSociale.trim()) {
        errors.nomRaisonSociale = ['Name/Company name is required']
      }

      // ⭐ NOUVELLE VALIDATION : Centre obligatoire
      if (!payload.centre || !payload.centre.trim()) {
        errors.centre = ['Centre is required and cannot be empty']
      }

      // Validation NIU (si fourni)
      if (payload.niu) {
        const niuTrimmed = payload.niu.trim()
        if (niuTrimmed.length < 6) {
          errors.niu = ['NIU must be at least 6 characters long']
        } else {
          const existingTaxpayer = await this.taxpayerService.findTaxpayerByNIU(niuTrimmed)
          if (existingTaxpayer) {
            return this.validationError(ctx, {
              niu: ['A taxpayer with this NIU already exists'],
            })
          }
        }
      }

      // Retourner les erreurs de validation
      if (Object.keys(errors).length > 0) {
        return this.validationError(ctx, errors)
      }

      const user = ctx.user as User
      const taxpayer = await this.taxpayerService.createTaxpayer(
        payload,
        user.id.toString(),
        'admin',
        'imported'
      )

      ctx.response.status(201)
      return this.success(
        ctx,
        {
          taxpayer: taxpayer.toJSON(),
        },
        'Taxpayer created successfully'
      )
    } catch (error: any) {
      console.error('Error creating taxpayer:', error)
      return this.error(ctx, 'Failed to create taxpayer', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  async show(ctx: HttpContext) {
    const { params } = ctx

    try {
      const taxpayer = await this.taxpayerService.findTaxpayerById(params.id)

      if (!taxpayer) {
        return this.notFound(ctx, 'Taxpayer not found')
      }

      const stats = await this.taxpayerService.getTaxpayerStats(taxpayer.id)

      return this.success(
        ctx,
        {
          taxpayer: taxpayer.toJSON(),
          stats,
        },
        'Taxpayer retrieved successfully'
      )
    } catch (error: any) {
      console.error('Error fetching taxpayer:', error)
      return this.error(ctx, 'Failed to fetch taxpayer', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  async update(ctx: HttpContext) {
    const { params, request } = ctx

    try {
      const taxpayer = await this.taxpayerService.findTaxpayerById(params.id)

      if (!taxpayer) {
        return this.notFound(ctx, 'Taxpayer not found')
      }

      const payload = request.only([
        'nomRaisonSociale',
        'prenomSigle',
        'numeroCniRc',
        'activite',
        'regime',
        'centre',
        'etat',
        'phoneNumber',
        'dateNaissance',
      ])

      if (payload.nomRaisonSociale && !payload.nomRaisonSociale.trim()) {
        return this.validationError(ctx, {
          nomRaisonSociale: ['Name/Company name cannot be empty'],
        })
      }

      const updatedTaxpayer = await this.taxpayerService.updateTaxpayer(taxpayer.id, payload)

      return this.success(
        ctx,
        {
          taxpayer: updatedTaxpayer.toJSON(),
        },
        'Taxpayer updated successfully'
      )
    } catch (error: any) {
      console.error('Error updating taxpayer:', error)
      return this.error(ctx, 'Failed to update taxpayer', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  async destroy(ctx: HttpContext) {
    const { params } = ctx

    try {
      const taxpayer = await this.taxpayerService.findTaxpayerById(params.id)

      if (!taxpayer) {
        return this.notFound(ctx, 'Taxpayer not found')
      }

      await this.taxpayerService.deleteTaxpayer(taxpayer.id)

      return this.success(
        ctx,
        {
          deleted_taxpayer: {
            id: taxpayer.id,
            niu: taxpayer.niu,
            nomRaisonSociale: taxpayer.nomRaisonSociale,
          },
        },
        'Taxpayer deleted successfully'
      )
    } catch (error: any) {
      if (error.message.includes('Cannot delete taxpayer')) {
        return this.error(ctx, error.message, 'TAXPAYER_HAS_USERS', 400)
      }
      console.error('Error deleting taxpayer:', error)
      return this.error(ctx, 'Failed to delete taxpayer', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  async syncWithDgi(ctx: HttpContext) {
    const { params } = ctx

    try {
      const taxpayer = await this.taxpayerService.findTaxpayerById(params.id)

      if (!taxpayer) {
        return this.notFound(ctx, 'Taxpayer not found')
      }

      const result = await this.taxpayerService.syncTaxpayerWithDGI(taxpayer)

      await taxpayer.refresh()

      return this.success(
        ctx,
        {
          taxpayer: taxpayer.toJSON(),
          sync_result: result,
        },
        'Taxpayer synchronized with DGI successfully'
      )
    } catch (error: any) {
      console.error('Error syncing with DGI:', error)
      return this.error(ctx, 'Failed to sync with DGI', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  async search(ctx: HttpContext) {
    const { request } = ctx

    try {
      const payload = request.only(['name', 'birthDate', 'niu'])
      const { name, birthDate, niu } = payload

      if (!niu && !name) {
        return this.validationError(
          ctx,
          {
            search: ['Provide either: name, name+birthDate, or niu'],
          },
          'Invalid search parameters'
        )
      }

      if (niu && niu.trim().length < 6) {
        return this.validationError(ctx, {
          niu: ['NIU must be at least 6 characters long'],
        })
      }

      if (name && name.trim().length < 2) {
        return this.validationError(ctx, {
          name: ['Name must be at least 2 characters long'],
        })
      }

      if (birthDate) {
        const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/
        if (!dateRegex.test(birthDate.trim())) {
          return this.validationError(ctx, {
            birth_date: ['Invalid date format. Use DD/MM/YYYY'],
          })
        }
      }

      const result = await this.taxpayerService.searchInDGI({ name, birthDate, niu })

      if (!result.success) {
        return this.error(ctx, result.message, 'DGI_SEARCH_FAILED', 400)
      }

      let searchType = 'name_only'
      if (niu) searchType = 'niu_verification'
      else if (name && birthDate) searchType = 'name_and_birth_date'

      return this.success(
        ctx,
        {
          search_type: searchType,
          query: { name, birth_date: birthDate, niu },
          results: result.data || [],
          count: Array.isArray(result.data) ? result.data.length : result.data ? 1 : 0,
          found: !!result.data,
        },
        result.message
      )
    } catch (error: any) {
      console.error('Error during DGI search:', error)
      return this.error(
        ctx,
        'Internal server error during search',
        ErrorCodes.INTERNAL_SERVER_ERROR,
        500
      )
    }
  }

  async testConnectivity(ctx: HttpContext) {
    try {
      const result = await this.taxpayerService.testConnectivity()

      if (result.success) {
        return this.success(
          ctx,
          {
            connectivity: 'ok',
            message: result.message,
            timestamp: Date.now(),
          },
          'DGI website is accessible'
        )
      } else {
        return this.error(ctx, result.message, 'DGI_CONNECTIVITY_ERROR', 503)
      }
    } catch (error: any) {
      console.error('Error testing connectivity:', error)
      return this.error(ctx, 'Failed to test connectivity', 'CONNECTIVITY_TEST_ERROR', 500)
    }
  }

  async cleanup(ctx: HttpContext) {
    try {
      await this.taxpayerService.cleanup()

      return this.success(
        ctx,
        {
          resources_cleared: true,
          timestamp: Date.now(),
        },
        'Browser resources cleaned up successfully'
      )
    } catch (error: any) {
      console.error('Error during cleanup:', error)
      return this.error(ctx, 'Failed to clean up resources', 'CLEANUP_ERROR', 500)
    }
  }

  /**
   * Endpoint simplifié pour récupérer la liste des centres
   */
  async getCentres(ctx: HttpContext) {
    try {
      const page = ctx.request.input('page', 1)
      const limit = Math.min(ctx.request.input('limit', 50), 100)
      const search = ctx.request.input('search', '')

      const result = await this.taxpayerService.getCentres(search, { page, limit })

      return this.paginated(ctx, result.data, result.pagination, 'Centres retrieved successfully')
    } catch (error: any) {
      console.error('Error fetching centres:', error)
      return this.error(ctx, 'Failed to fetch centres', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  /**
   * Nouvel endpoint pour obtenir les statistiques des centres
   */
  async getCentreStats(ctx: HttpContext) {
    try {
      const stats = await this.taxpayerService.getCentreStats()

      return this.success(ctx, stats, 'Centre statistics retrieved successfully')
    } catch (error: any) {
      console.error('Error fetching centre statistics:', error)
      return this.error(
        ctx,
        'Failed to fetch centre statistics',
        ErrorCodes.INTERNAL_SERVER_ERROR,
        500
      )
    }
  }

  /**
   * Valide et teste les filtres de recherche multiples
   *
   * @description Endpoint utilitaire pour tester et déboguer les filtres.
   * Permet de voir comment les filtres sont interprétés et normalisés.
   *
   * @param ctx - Contexte HTTP
   * @returns Promise<Response> - Informations détaillées sur les filtres
   *
   * @example
   * POST /taxpayers/validate-filters
   * Body: { "centre": ["Centre Nord", "Douala"], "etat": "Actif,Suspendu" }
   */
  async validateFilters(ctx: HttpContext) {
    try {
      /**
       * Interface pour les filtres à valider
       */
      interface FiltersToValidate {
        search?: string
        type_contribuable?: string | string[]
        etat?: string | string[]
        centre?: string | string[]
        regime?: string | string[]
        phone_number?: string
        source?: string | string[]
        created_by_type?: string | string[]
        sort_by?: string
        sort_order?: string
      }

      const filters: FiltersToValidate = ctx.request.only([
        'search',
        'type_contribuable',
        'etat',
        'centre',
        'regime',
        'phone_number',
        'source',
        'created_by_type',
        'sort_by',
        'sort_order',
      ])

      // Support pour les paramètres avec crochets (key[])
      const filterKeys = Object.keys(filters) as Array<keyof FiltersToValidate>
      filterKeys.forEach((key) => {
        const arrayValue = ctx.request.input(`${key}[]`)
        if (arrayValue) {
          ;(filters as any)[key] = Array.isArray(arrayValue) ? arrayValue : [arrayValue]
        }
      })

      // Normalisation des filtres via la méthode privée du service
      // Note: Accès temporaire à la méthode privée pour les tests
      const normalizedFilters = (this.taxpayerService as any).normalizeFilters(filters)

      /**
       * Génération des informations de filtrage pour le débogage
       */
      const filterInfo = {
        centres: Array.isArray(normalizedFilters.centre)
          ? `Filtering by ${normalizedFilters.centre.length} centres: ${normalizedFilters.centre.join(', ')}`
          : normalizedFilters.centre
            ? `Filtering by centre: ${normalizedFilters.centre}`
            : 'No centre filter',
        etat: Array.isArray(normalizedFilters.etat)
          ? `Filtering by ${normalizedFilters.etat.length} states: ${normalizedFilters.etat.join(', ')}`
          : normalizedFilters.etat
            ? `Filtering by state: ${normalizedFilters.etat}`
            : 'No state filter',
        total_filters_applied: Object.keys(normalizedFilters).filter(
          (key) => normalizedFilters[key] && key !== 'sort_by' && key !== 'sort_order'
        ).length,
      }

      return this.success(
        ctx,
        {
          original_filters: filters,
          normalized_filters: normalizedFilters,
          filter_info: filterInfo,
        },
        'Filters validated successfully'
      )
    } catch (error: any) {
      console.error('Error validating filters:', error)
      return this.error(ctx, 'Failed to validate filters', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }
}
