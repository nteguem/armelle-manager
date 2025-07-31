import type { HttpContext } from '@adonisjs/core/http'
import DGIScraperService from '#services/dgi_scraper_service'
import BaseController from '#controllers/base_controller'
import { ErrorCodes } from '#services/response_formatter'
import Taxpayer from '#models/tax_payer'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { TaxpayerStatus } from '#types/taxpayer_types'

export default class TaxPayerController extends BaseController {
  private dgiScraperService: DGIScraperService

  constructor() {
    super()
    this.dgiScraperService = new DGIScraperService()
  }

  /*
  |--------------------------------------------------------------------------
  | CRUD Operations
  |--------------------------------------------------------------------------
  */

  /**
   * Liste paginée des taxpayers avec filtres
   * GET /api/v1/admin/tax-payers
   */
  async index(ctx: HttpContext) {
    const { request } = ctx

    try {
      const page = request.input('page', 1)
      const limit = Math.min(request.input('limit', 20), 100) // Max 100 par page

      // Filtres
      const filters = request.only([
        'search',
        'type_contribuable',
        'etat',
        'centre',
        'regime',
        'status',
        'phone_number',
      ])

      // Tri
      const sortBy = request.input('sort_by', 'created_at')
      const sortOrder = request.input('sort_order', 'desc')

      let query = Taxpayer.query()

      // Application des filtres
      if (filters.search) {
        query = query.where((builder) => {
          builder
            .whereILike('niu', `%${filters.search}%`)
            .orWhereILike('nomRaisonSociale', `%${filters.search}%`)
            .orWhereILike('prenomSigle', `%${filters.search}%`)
            .orWhereILike('phoneNumber', `%${filters.search}%`)
        })
      }

      if (filters.type_contribuable) {
        query = query.where('typeContribuable', filters.type_contribuable)
      }

      if (filters.etat) {
        query = query.whereILike('etat', `%${filters.etat}%`)
      }

      if (filters.centre) {
        query = query.whereILike('centre', `%${filters.centre}%`)
      }

      if (filters.regime) {
        query = query.whereILike('regime', `%${filters.regime}%`)
      }

      if (filters.status) {
        query = query.where('status', filters.status)
      }

      if (filters.phone_number) {
        query = query.whereILike('phoneNumber', `%${filters.phone_number}%`)
      }

      // Tri
      const allowedSortFields = [
        'created_at',
        'updated_at',
        'nomRaisonSociale',
        'niu',
        'etat',
        'typeContribuable',
        'status',
        'lastDgiCheck',
      ]

      if (allowedSortFields.includes(sortBy)) {
        query = query.orderBy(sortBy, sortOrder === 'asc' ? 'asc' : 'desc')
      }

      // Pagination
      const taxpayers = await query.paginate(page, limit)
      const paginatedData = taxpayers.toJSON()

      // Statistiques générales
      const stats = await this._getGeneralStats()

      // Utiliser la méthode paginated du BaseController
      return this.paginated(
        ctx,
        paginatedData.data,
        {
          current_page: paginatedData.meta.currentPage,
          total_pages: paginatedData.meta.lastPage,
          per_page: paginatedData.meta.perPage,
          total_items: paginatedData.meta.total,
        },
        'Taxpayers retrieved successfully'
      )
    } catch (error: any) {
      console.error('Error fetching taxpayers:', error)
      return this.error(ctx, 'Failed to fetch taxpayers', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  /**
   * Création d'un nouveau taxpayer
   * POST /api/v1/admin/tax-payers
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
        'centre',
        'etat',
        'phoneNumber',
        'dateNaissance',
      ])

      // Validation
      const errors: any = {}

      if (!payload.nomRaisonSociale || !payload.nomRaisonSociale.trim()) {
        errors.nomRaisonSociale = ['Name/Company name is required']
      }

      // Si NIU fourni, validation et vérification unicité
      if (payload.niu) {
        const niuTrimmed = payload.niu.trim()
        if (niuTrimmed.length < 6) {
          errors.niu = ['NIU must be at least 6 characters long']
        } else {
          // Vérifier si le NIU existe déjà
          const existingTaxpayer = await Taxpayer.findByNIU(niuTrimmed)
          if (existingTaxpayer) {
            return this.validationError(ctx, {
              niu: ['A taxpayer with this NIU already exists'],
            })
          }
        }
      }

      if (Object.keys(errors).length > 0) {
        return this.validationError(ctx, errors)
      }

      // Déterminer le type automatiquement si NIU fourni
      const typeContribuable = payload.niu
        ? Taxpayer.getTypeFromNIU(payload.niu.trim())
        : 'personne_physique' // Default

      // Créer le taxpayer
      const taxpayer = await Taxpayer.create({
        niu: payload.niu?.trim() || null,
        nomRaisonSociale: payload.nomRaisonSociale.trim(),
        prenomSigle: payload.prenomSigle?.trim() || null,
        numeroCniRc: payload.numeroCniRc?.trim() || null,
        activite: payload.activite?.trim() || null,
        regime: payload.regime?.trim() || null,
        centre: payload.centre?.trim() || null,
        etat: payload.etat?.trim() || null,
        phoneNumber: payload.phoneNumber?.trim() || null,
        dateNaissance: payload.dateNaissance ? DateTime.fromISO(payload.dateNaissance) : null,
        typeContribuable,
        status: TaxpayerStatus.NOT_YET_CHECKED,
        dgiRawData: {},
        lastDgiCheck: null,
      })

      // Si NIU fourni, lancer synchronisation automatique
      if (payload.niu?.trim()) {
        try {
          await this._performDgiSync(taxpayer)
        } catch (syncError) {
          console.error('Auto-sync failed for new taxpayer:', syncError)
          // On continue même si la sync échoue - le taxpayer est créé
        }
      }

      // Recharger pour avoir les données à jour après sync
      await taxpayer.refresh()

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

  /**
   * Affichage d'un taxpayer spécifique
   * GET /api/v1/admin/tax-payers/:id
   */
  async show(ctx: HttpContext) {
    const { params } = ctx

    try {
      const taxpayer = await Taxpayer.find(params.id)

      if (!taxpayer) {
        return this.notFound(ctx, 'Taxpayer not found')
      }

      // Récupérer les statistiques
      const stats = await taxpayer.getStats()

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

  /**
   * Mise à jour d'un taxpayer
   * PUT /api/v1/admin/tax-payers/:id
   */
  async update(ctx: HttpContext) {
    const { params, request } = ctx

    try {
      const taxpayer = await Taxpayer.find(params.id)

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

      // Validation basique
      if (payload.nomRaisonSociale && !payload.nomRaisonSociale.trim()) {
        return this.validationError(ctx, {
          nomRaisonSociale: ['Name/Company name cannot be empty'],
        })
      }

      // Mise à jour des champs
      if (payload.nomRaisonSociale) taxpayer.nomRaisonSociale = payload.nomRaisonSociale.trim()
      if (payload.prenomSigle !== undefined)
        taxpayer.prenomSigle = payload.prenomSigle?.trim() || null
      if (payload.numeroCniRc !== undefined)
        taxpayer.numeroCniRc = payload.numeroCniRc?.trim() || null
      if (payload.activite !== undefined) taxpayer.activite = payload.activite?.trim() || null
      if (payload.regime !== undefined) taxpayer.regime = payload.regime?.trim() || null
      if (payload.centre !== undefined) taxpayer.centre = payload.centre?.trim() || null
      if (payload.etat !== undefined) taxpayer.etat = payload.etat?.trim() || null
      if (payload.phoneNumber !== undefined)
        taxpayer.phoneNumber = payload.phoneNumber?.trim() || null
      if (payload.dateNaissance !== undefined)
        taxpayer.dateNaissance = payload.dateNaissance
          ? DateTime.fromISO(payload.dateNaissance)
          : null

      await taxpayer.save()

      return this.success(
        ctx,
        {
          taxpayer: taxpayer.toJSON(),
        },
        'Taxpayer updated successfully'
      )
    } catch (error: any) {
      console.error('Error updating taxpayer:', error)
      return this.error(ctx, 'Failed to update taxpayer', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  /**
   * Suppression d'un taxpayer
   * DELETE /api/v1/admin/tax-payers/:id
   */
  async destroy(ctx: HttpContext) {
    const { params } = ctx

    try {
      const taxpayer = await Taxpayer.find(params.id)

      if (!taxpayer) {
        return this.notFound(ctx, 'Taxpayer not found')
      }

      // Vérifier s'il y a des utilisateurs associés
      await taxpayer.load('botUsers')

      if (taxpayer.botUsers.length > 0) {
        return this.error(
          ctx,
          `Cannot delete taxpayer. ${taxpayer.botUsers.length} bot user(s) are associated with this taxpayer.`,
          'TAXPAYER_HAS_USERS',
          400
        )
      }

      await taxpayer.delete()

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
      console.error('Error deleting taxpayer:', error)
      return this.error(ctx, 'Failed to delete taxpayer', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  /**
   * Synchronisation avec la DGI
   * POST /api/v1/admin/tax-payers/:id/sync-dgi
   */
  async syncWithDgi(ctx: HttpContext) {
    const { params } = ctx

    try {
      const taxpayer = await Taxpayer.find(params.id)

      if (!taxpayer) {
        return this.notFound(ctx, 'Taxpayer not found')
      }

      const result = await this._performDgiSync(taxpayer)

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

  /*
  |--------------------------------------------------------------------------
  | Méthodes de recherche DGI (existantes)
  |--------------------------------------------------------------------------
  */

  /**
   * Universal search endpoint for DGI taxpayer data
   * POST /api/v1/admin/tax-payers/search
   */
  async search(ctx: HttpContext) {
    const { request } = ctx

    try {
      const payload = request.only(['name', 'birthDate', 'niu'])
      const { name, birthDate, niu } = payload

      // Determine search type based on provided parameters
      if (niu) {
        return await this._verifyNiu(ctx, niu)
      } else if (name && birthDate) {
        return await this._searchByNameAndBirth(ctx, name, birthDate)
      } else if (name) {
        return await this._searchByName(ctx, name)
      } else {
        return this.validationError(
          ctx,
          {
            search: ['Provide either: name, name+birthDate, or niu'],
          },
          'Invalid search parameters'
        )
      }
    } catch (error) {
      console.error('Error during DGI search:', error)
      return this.error(
        ctx,
        'Internal server error during search',
        ErrorCodes.INTERNAL_SERVER_ERROR,
        500
      )
    }
  }

  /**
   * Test connectivity to DGI website
   * GET /api/v1/admin/tax-payers/test
   */
  async testConnectivity(ctx: HttpContext) {
    try {
      const result = await this.dgiScraperService.testConnectivity()

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

  /**
   * Clean up browser resources
   * POST /api/v1/admin/tax-payers/cleanup
   */
  async cleanup(ctx: HttpContext) {
    try {
      await this.dgiScraperService.close()

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

  /*
  |--------------------------------------------------------------------------
  | Méthodes privées
  |--------------------------------------------------------------------------
  */

  /**
   * Effectue la synchronisation DGI intelligente
   */
  private async _performDgiSync(taxpayer: Taxpayer): Promise<string> {
    let result: any = null

    // Stratégie 1: Si NIU disponible, utiliser verifierNIU
    if (taxpayer.niu) {
      result = await this.dgiScraperService.verifierNIU(taxpayer.niu)
      if (result.success && result.data) {
        await taxpayer.updateFromDGI(result.data)
        return 'verified_by_niu'
      }
    }

    // Stratégie 2: Si nom + date de naissance, utiliser rechercher
    if (taxpayer.nomRaisonSociale && taxpayer.dateNaissance) {
      const dateFormatted = taxpayer.dateNaissance.toFormat('dd/MM/yyyy')
      result = await this.dgiScraperService.rechercher(taxpayer.nomRaisonSociale, dateFormatted)
      if (result.success && result.data && result.data.length > 0) {
        // Prendre le premier résultat si multiple
        await taxpayer.updateFromDGI(result.data[0])
        return 'verified_by_name_and_birth'
      }
    }

    // Stratégie 3: Recherche par nom seulement
    if (taxpayer.nomRaisonSociale) {
      result = await this.dgiScraperService.rechercherParNom(taxpayer.nomRaisonSociale)
      if (result.success && result.data && result.data.length > 0) {
        // Si résultat unique, mettre à jour
        if (result.data.length === 1) {
          await taxpayer.updateFromDGI(result.data[0])
          return 'verified_by_name_single'
        } else {
          // Résultats multiples - marquer comme non trouvé pour intervention manuelle
          await taxpayer.markAsNotFoundInDGI()
          return 'multiple_results_found'
        }
      }
    }

    // Aucun résultat trouvé
    await taxpayer.markAsNotFoundInDGI()
    return 'not_found'
  }

  /**
   * Search by name only
   */
  private async _searchByName(ctx: HttpContext, name: string) {
    // Validation
    if (!name || !name.trim() || name.trim().length < 2) {
      return this.validationError(ctx, {
        name: ['Name must be at least 2 characters long'],
      })
    }

    try {
      const result = await this.dgiScraperService.rechercherParNom(name.trim())

      if (!result.success) {
        return this.error(ctx, result.message, 'SEARCH_BY_NAME_FAILED', 400)
      }

      return this.success(
        ctx,
        {
          search_type: 'name_only',
          query: { name: name.trim() },
          result_type: result.type || 'success',
          results: result.data || [],
          count: result.data?.length || 0,
        },
        result.message
      )
    } catch (error: any) {
      return this.error(ctx, 'Technical error during name search', 'NAME_SEARCH_ERROR', 500)
    }
  }

  /**
   * Search by name and birth date
   */
  private async _searchByNameAndBirth(ctx: HttpContext, name: string, birthDate: string) {
    // Validation
    const errors: any = {}

    if (!name || !name.trim() || name.trim().length < 2) {
      errors.name = ['Name must be at least 2 characters long']
    }

    if (!birthDate || !birthDate.trim()) {
      errors.birth_date = ['Birth date is required']
    } else {
      // Validate date format (DD/MM/YYYY)
      const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/
      if (!dateRegex.test(birthDate.trim())) {
        errors.birth_date = ['Invalid date format. Use DD/MM/YYYY']
      }
    }

    if (Object.keys(errors).length > 0) {
      return this.validationError(ctx, errors)
    }

    try {
      const result = await this.dgiScraperService.rechercher(name.trim(), birthDate.trim())

      if (!result.success) {
        return this.error(ctx, result.message, 'SEARCH_BY_NAME_AND_BIRTH_FAILED', 400)
      }

      return this.success(
        ctx,
        {
          search_type: 'name_and_birth_date',
          query: {
            name: name.trim(),
            birth_date: birthDate.trim(),
          },
          results: result.data || [],
          count: result.data?.length || 0,
        },
        result.message
      )
    } catch (error: any) {
      return this.error(
        ctx,
        'Technical error during name and birth date search',
        'NAME_BIRTH_SEARCH_ERROR',
        500
      )
    }
  }

  /**
   * Verify NIU
   */
  private async _verifyNiu(ctx: HttpContext, niu: string) {
    // Validation
    if (!niu || !niu.trim()) {
      return this.validationError(ctx, {
        niu: ['NIU is required'],
      })
    }

    if (niu.trim().length < 6) {
      return this.validationError(ctx, {
        niu: ['NIU must be at least 6 characters long'],
      })
    }

    try {
      const result = await this.dgiScraperService.verifierNIU(niu.trim())

      if (!result.success) {
        return this.error(ctx, result.message, 'NIU_VERIFICATION_FAILED', 400)
      }

      return this.success(
        ctx,
        {
          search_type: 'niu_verification',
          query: { niu: niu.trim() },
          taxpayer: result.data,
          found: !!result.data,
        },
        result.message
      )
    } catch (error: any) {
      return this.error(
        ctx,
        'Technical error during NIU verification',
        'NIU_VERIFICATION_ERROR',
        500
      )
    }
  }

  /**
   * Récupère les statistiques générales
   */
  private async _getGeneralStats() {
    try {
      const stats = await db
        .from('taxpayers')
        .select(
          db.raw('COUNT(*) as total'),
          db.raw('COUNT(CASE WHEN type_contribuable = ? THEN 1 END) as personnes_physiques', [
            'personne_physique',
          ]),
          db.raw('COUNT(CASE WHEN type_contribuable = ? THEN 1 END) as personnes_morales', [
            'personne_morale',
          ]),
          db.raw('COUNT(CASE WHEN status = ? THEN 1 END) as verified_found', [
            TaxpayerStatus.VERIFIED_FOUND,
          ]),
          db.raw('COUNT(CASE WHEN status = ? THEN 1 END) as not_yet_checked', [
            TaxpayerStatus.NOT_YET_CHECKED,
          ]),
          db.raw('COUNT(CASE WHEN status = ? THEN 1 END) as verified_not_found', [
            TaxpayerStatus.VERIFIED_NOT_FOUND,
          ]),
          db.raw('COUNT(CASE WHEN LOWER(etat) = ? THEN 1 END) as actifs', ['actif'])
        )
        .first()

      return {
        total: Number(stats?.total || 0),
        personnes_physiques: Number(stats?.personnes_physiques || 0),
        personnes_morales: Number(stats?.personnes_morales || 0),
        verified_found: Number(stats?.verified_found || 0),
        not_yet_checked: Number(stats?.not_yet_checked || 0),
        verified_not_found: Number(stats?.verified_not_found || 0),
        actifs: Number(stats?.actifs || 0),
      }
    } catch (error) {
      console.error('Error getting stats:', error)
      return {
        total: 0,
        personnes_physiques: 0,
        personnes_morales: 0,
        verified_found: 0,
        not_yet_checked: 0,
        verified_not_found: 0,
        actifs: 0,
      }
    }
  }
}
