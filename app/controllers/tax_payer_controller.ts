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

  async index(ctx: HttpContext) {
    const { request } = ctx

    try {
      const page = request.input('page', 1)
      const limit = Math.min(request.input('limit', 20), 100)

      const filters = request.only([
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

      const taxpayers = await this.taxpayerService.searchTaxpayers(filters, { page, limit })
      const paginatedData = taxpayers.toJSON()

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

      const errors: any = {}

      if (!payload.nomRaisonSociale || !payload.nomRaisonSociale.trim()) {
        errors.nomRaisonSociale = ['Name/Company name is required']
      }

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
}
