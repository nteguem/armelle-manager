import type { HttpContext } from '@adonisjs/core/http'
import DGIScraperService from '#services/dgi_scraper_service'
import BaseController from '#controllers/base_controller'
import { ErrorCodes } from '#services/response_formatter'

export default class DgiController extends BaseController {
  private dgiScraperService: DGIScraperService

  constructor() {
    super()
    this.dgiScraperService = new DGIScraperService()
  }

  /**
   * Universal search endpoint for DGI taxpayer data
   * POST /api/v1/admin/tax-payers/search
   *
   * Search types:
   * 1. By name only: { "name": "DUPONT" }
   * 2. By name and birth date: { "name": "DUPONT", "birthDate": "15/03/1985" }
   * 3. By NIU verification: { "niu": "12345678" }
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
}
