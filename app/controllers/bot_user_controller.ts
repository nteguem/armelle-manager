import type { HttpContext } from '@adonisjs/core/http'
import BaseController from '#controllers/base_controller'
import { ErrorCodes } from '#services/response_formatter'
import BotUserService from '#services/bot_user_service'

export default class BotUserController extends BaseController {
  private botUserService: BotUserService

  constructor() {
    super()
    this.botUserService = new BotUserService()
  }

  /**
   * Liste paginée des bot users avec filtres et recherche
   */
  async index(ctx: HttpContext) {
    const { request } = ctx

    try {
      const page = request.input('page', 1)
      const limit = Math.min(request.input('limit', 20), 100)

      const filters = request.only([
        'search',
        'language',
        'isActive',
        'isVerified',
        'registrationChannel',
        'sort_by',
        'sort_order',
      ])

      const botUsers = await this.botUserService.searchBotUsers(filters, { page, limit })
      const paginatedData = botUsers.toJSON()

      return this.paginated(
        ctx,
        paginatedData.data,
        {
          current_page: paginatedData.meta.currentPage,
          total_pages: paginatedData.meta.lastPage,
          per_page: paginatedData.meta.perPage,
          total_items: paginatedData.meta.total,
        },
        'Bot users retrieved successfully'
      )
    } catch (error: any) {
      console.error('Error fetching bot users:', error)
      return this.error(ctx, 'Failed to fetch bot users', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  /**
   * Détails d'un bot user spécifique
   */
  async show(ctx: HttpContext) {
    const { params } = ctx

    try {
      const botUser = await this.botUserService.findBotUserById(params.id)

      if (!botUser) {
        return this.notFound(ctx, 'Bot user not found')
      }

      const taxpayersCount = await this.botUserService.getBotUserTaxpayers(botUser.id)
      const taxpayersData = taxpayersCount.toJSON ? taxpayersCount.toJSON() : taxpayersCount

      // Obtenir les statistiques des messages
      const messageStats = await this.botUserService.getBotUserMessageStats(botUser.id)

      return this.success(
        ctx,
        {
          botUser: botUser.toJSON(),
          taxpayers_count: taxpayersData.meta?.total || 0,
          message_stats: messageStats,
        },
        'Bot user retrieved successfully'
      )
    } catch (error: any) {
      console.error('Error fetching bot user:', error)
      return this.error(ctx, 'Failed to fetch bot user', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  /**
   * Mise à jour d'un bot user
   */
  async update(ctx: HttpContext) {
    const { params, request } = ctx

    try {
      const botUser = await this.botUserService.findBotUserById(params.id)

      if (!botUser) {
        return this.notFound(ctx, 'Bot user not found')
      }

      const payload = request.only([
        'fullName',
        'language',
        'isActive',
        'isVerified',
        'registrationChannel',
        'metadata',
      ])

      const errors: any = {}

      if (payload.language && !['fr', 'en'].includes(payload.language)) {
        errors.language = ['Language must be either fr or en']
      }

      if (payload.isActive !== undefined && typeof payload.isActive !== 'boolean') {
        errors.isActive = ['isActive must be a boolean value']
      }

      if (payload.isVerified !== undefined && typeof payload.isVerified !== 'boolean') {
        errors.isVerified = ['isVerified must be a boolean value']
      }

      if (Object.keys(errors).length > 0) {
        return this.validationError(ctx, errors)
      }

      const updatedBotUser = await this.botUserService.updateBotUser(botUser.id, payload)

      return this.success(
        ctx,
        {
          botUser: updatedBotUser.toJSON(),
        },
        'Bot user updated successfully'
      )
    } catch (error: any) {
      console.error('Error updating bot user:', error)
      return this.error(ctx, 'Failed to update bot user', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  /**
   * Suppression d'un bot user
   */
  async destroy(ctx: HttpContext) {
    const { params } = ctx

    try {
      const botUser = await this.botUserService.findBotUserById(params.id)

      if (!botUser) {
        return this.notFound(ctx, 'Bot user not found')
      }

      await this.botUserService.deleteBotUser(botUser.id)

      return this.success(
        ctx,
        {
          deleted_bot_user: {
            id: botUser.id,
            phoneNumber: botUser.phoneNumber,
            fullName: botUser.fullName,
          },
        },
        'Bot user deleted successfully'
      )
    } catch (error: any) {
      if (error.message.includes('Cannot delete bot user')) {
        return this.error(ctx, error.message, 'BOTUSER_HAS_TAXPAYERS', 400)
      }
      console.error('Error deleting bot user:', error)
      return this.error(ctx, 'Failed to delete bot user', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  /**
   * Messages d'un bot user pour l'affichage en conversation
   */
  async getMessages(ctx: HttpContext) {
    const { params, request } = ctx

    try {
      const botUser = await this.botUserService.findBotUserById(params.id)

      if (!botUser) {
        return this.notFound(ctx, 'Bot user not found')
      }

      const page = request.input('page', 1)
      const limit = Math.min(request.input('limit', 50), 100)

      const filters = request.only([
        'direction',
        'messageType',
        'dateFrom',
        'dateTo',
        'search',
        'sort_by',
        'sort_order',
      ])

      const result = await this.botUserService.getBotUserMessages(botUser.id, filters, {
        page,
        limit,
      })

      return this.paginated(
        ctx,
        result.data,
        result.meta,
        'Bot user messages retrieved successfully'
      )
    } catch (error: any) {
      console.error('Error fetching bot user messages:', error)
      return this.error(
        ctx,
        'Failed to fetch bot user messages',
        ErrorCodes.INTERNAL_SERVER_ERROR,
        500
      )
    }
  }

  /**
   * Statistiques des messages d'un bot user
   */
  async getMessageStats(ctx: HttpContext) {
    const { params } = ctx

    try {
      const botUser = await this.botUserService.findBotUserById(params.id)

      if (!botUser) {
        return this.notFound(ctx, 'Bot user not found')
      }

      const stats = await this.botUserService.getBotUserMessageStats(botUser.id)

      return this.success(
        ctx,
        {
          bot_user: {
            id: botUser.id,
            phoneNumber: botUser.phoneNumber,
            fullName: botUser.fullName,
          },
          message_stats: stats,
          generated_at: new Date().toISOString(),
        },
        'Bot user message statistics retrieved successfully'
      )
    } catch (error: any) {
      console.error('Error fetching bot user message stats:', error)
      return this.error(
        ctx,
        'Failed to fetch bot user message stats',
        ErrorCodes.INTERNAL_SERVER_ERROR,
        500
      )
    }
  }

  /**
   * Taxpayers liés à ce bot user
   */
  async getTaxpayers(ctx: HttpContext) {
    const { params, request } = ctx

    try {
      const botUser = await this.botUserService.findBotUserById(params.id)

      if (!botUser) {
        return this.notFound(ctx, 'Bot user not found')
      }

      const filters = request.only([
        'relationshipType',
        'source',
        'etat',
        'sort_by',
        'sort_order',
        'page',
        'limit',
      ])

      const taxpayers = await this.botUserService.getBotUserTaxpayers(botUser.id, filters)
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
        'Bot user taxpayers retrieved successfully'
      )
    } catch (error: any) {
      console.error('Error fetching bot user taxpayers:', error)
      return this.error(
        ctx,
        'Failed to fetch bot user taxpayers',
        ErrorCodes.INTERNAL_SERVER_ERROR,
        500
      )
    }
  }

  /**
   * Statistiques globales des bot users
   */
  async getStats(ctx: HttpContext) {
    try {
      const stats = await this.botUserService.getBotUserStats()

      return this.success(
        ctx,
        {
          stats,
          generated_at: new Date().toISOString(),
        },
        'Bot users statistics retrieved successfully'
      )
    } catch (error: any) {
      console.error('Error fetching bot users stats:', error)
      return this.error(
        ctx,
        'Failed to fetch bot users stats',
        ErrorCodes.INTERNAL_SERVER_ERROR,
        500
      )
    }
  }
}
