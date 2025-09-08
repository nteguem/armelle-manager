import BaseController from './base_controller.js'
import BotIgsCalculation from '#models/bot/bot_igs_calculation'
import BotUser from '#models/bot/bot_user'
import type { HttpContext } from '@adonisjs/core/http'

export default class IgsCalculationsController extends BaseController {
  /**
   * Liste paginée des calculs IGS avec filtres
   */
  async index(ctx: HttpContext) {
    try {
      const { request } = ctx
      const {
        page = 1,
        limit = 10,
        search,
        sector,
        year,
        bot_user_id: botUserId,
        sort_by: sortBy = 'created_at',
        sort_order: sortOrder = 'desc',
      } = request.qs()

      const query = BotIgsCalculation.query().preload('botUser')

      // Filtres de recherche
      if (search) {
        query.where((builder) => {
          builder
            .whereILike('company_name', `%${search}%`)
            .orWhereILike('phone_number', `%${search}%`)
            .orWhereILike('niu', `%${search}%`)
        })
      }

      // Filtre par secteur
      if (sector) {
        query.where('sector', sector)
      }

      // Filtre par année
      if (year) {
        query.where('current_year', Number.parseInt(year))
      }

      // Filtre par utilisateur bot
      if (botUserId) {
        query.where('bot_user_id', botUserId)
      }

      // Tri
      query.orderBy(sortBy, sortOrder)

      // Pagination
      const calculations = await query.paginate(page, limit)

      // Formater les données de réponse
      const formattedData = calculations.toJSON()
      formattedData.data = formattedData.data.map((calc: any) => ({
        id: calc.id,
        bot_user: {
          id: calc.bot_user?.id || calc.botUser?.id,
          phone_number: calc.bot_user?.phone_number || calc.botUser?.phoneNumber,
          full_name: calc.bot_user?.full_name || calc.botUser?.fullName,
          display_name:
            calc.bot_user?.full_name ||
            calc.botUser?.fullName ||
            calc.bot_user?.phone_number ||
            calc.botUser?.phoneNumber,
        },
        company_info: {
          name: calc.company_name,
          type: calc.company_type,
          sector: calc.sector,
          subcategory: calc.subcategory,
        },
        financial_data: {
          previous_year: calc.previous_year,
          current_year: calc.current_year,
          previous_year_revenue: calc.previous_year_revenue,
          current_year_estimate: calc.current_year_estimate,
          calculated_igs: calc.calculated_igs,
          formatted_igs: calc.calculated_igs
            ? calc.calculated_igs.toLocaleString('fr-FR') + ' FCFA'
            : 'N/A',
          formatted_revenue: calc.previous_year_revenue
            ? calc.previous_year_revenue.toLocaleString('fr-FR') + ' FCFA'
            : 'N/A',
        },
        contact_info: {
          phone_number: calc.phone_number,
          city: calc.city,
          neighborhood: calc.neighborhood,
          niu: calc.niu,
        },
        metadata: {
          calculation_version: calc.calculation_version,
          year_range: `${calc.previous_year}-${calc.current_year}`,
        },
        timestamps: {
          created_at: calc.created_at,
          updated_at: calc.updated_at,
        },
      }))

      return this.paginated(ctx, formattedData.data, {
        current_page: formattedData.meta.current_page,
        total_pages: formattedData.meta.last_page,
        per_page: formattedData.meta.per_page,
        total_items: formattedData.meta.total,
      })
    } catch (error) {
      return this.error(
        ctx,
        'Erreur lors de la récupération des calculs IGS',
        'IGS_LIST_ERROR',
        500,
        error.message
      )
    }
  }

  /**
   * Détails d'un calcul IGS spécifique
   */
  async show(ctx: HttpContext) {
    try {
      const { params } = ctx
      const calculation = await BotIgsCalculation.query()
        .where('id', params.id)
        .preload('botUser')
        .first()

      if (!calculation) {
        return this.notFound(ctx, 'Calcul IGS non trouvé')
      }

      const formattedData = {
        id: calculation.id,
        bot_user: {
          id: calculation.botUser?.id,
          phone_number: calculation.botUser?.phoneNumber,
          full_name: calculation.botUser?.fullName,
          display_name: calculation.botUser?.displayName,
          language: calculation.botUser?.language,
          is_verified: calculation.botUser?.isVerified,
        },
        company_info: {
          name: calculation.companyName,
          type: calculation.companyType,
          sector: calculation.sector,
          subcategory: calculation.subcategory,
          display_info: calculation.displayCompanyInfo,
        },
        financial_data: {
          previous_year: calculation.previousYear,
          current_year: calculation.currentYear,
          previous_year_revenue: calculation.previousYearRevenue,
          current_year_estimate: calculation.currentYearEstimate,
          calculated_igs: calculation.calculatedIgs,
          formatted_igs: calculation.formattedIgs,
          formatted_revenue: calculation.formattedRevenue,
        },
        contact_info: {
          phone_number: calculation.phoneNumber,
          city: calculation.city,
          neighborhood: calculation.neighborhood,
          niu: calculation.niu,
        },
        metadata: {
          calculation_version: calculation.calculationVersion,
          year_range: calculation.yearRange,
          raw_workflow_data: calculation.rawWorkflowData,
        },
        timestamps: {
          created_at: calculation.createdAt,
          updated_at: calculation.updatedAt,
        },
      }

      return this.success(ctx, formattedData)
    } catch (error) {
      return this.error(
        ctx,
        'Erreur lors de la récupération du calcul IGS',
        'IGS_SHOW_ERROR',
        500,
        error.message
      )
    }
  }

  /**
   * Statistiques des calculs IGS
   */
  async getStats(ctx: HttpContext) {
    try {
      const totalCalculations = await BotIgsCalculation.query().count('* as total')
      const currentYear = new Date().getFullYear()

      const yearlyStats = await BotIgsCalculation.query()
        .where('current_year', currentYear)
        .count('* as total')

      const sectorStats = await BotIgsCalculation.query()
        .groupBy('sector')
        .count('* as total')
        .select('sector')

      const avgIgs = await BotIgsCalculation.query().avg('calculated_igs as average').first()

      const totalIgsAmount = await BotIgsCalculation.query().sum('calculated_igs as total').first()

      const recentCalculations = await BotIgsCalculation.query()
        .where('created_at', '>=', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) // 30 derniers jours
        .count('* as total')

      return this.success(ctx, {
        totals: {
          all_calculations: Number.parseInt(totalCalculations[0].$extras.total),
          current_year: Number.parseInt(yearlyStats[0].$extras.total),
          recent_30_days: Number.parseInt(recentCalculations[0].$extras.total),
        },
        financial: {
          average_igs: Math.round(Number.parseFloat(avgIgs?.$extras.average || '0')),
          total_igs_amount: Number.parseInt(totalIgsAmount?.$extras.total || '0'),
          formatted_average:
            Math.round(Number.parseFloat(avgIgs?.$extras.average || '0')).toLocaleString('fr-FR') +
            ' FCFA',
          formatted_total:
            Number.parseInt(totalIgsAmount?.$extras.total || '0').toLocaleString('fr-FR') + ' FCFA',
        },
        sectors: sectorStats.map((stat: any) => ({
          sector: stat.sector,
          count: Number.parseInt(stat.$extras.total),
        })),
      })
    } catch (error) {
      return this.error(
        ctx,
        'Erreur lors de la récupération des statistiques',
        'IGS_STATS_ERROR',
        500,
        error.message
      )
    }
  }

  /**
   * Récupère les calculs IGS d'un utilisateur bot spécifique
   */
  async getByBotUser(ctx: HttpContext) {
    try {
      const { params, request } = ctx
      const { page = 1, limit = 10 } = request.qs()

      // Vérifier que l'utilisateur bot existe
      const botUser = await BotUser.find(params.bot_user_id)
      if (!botUser) {
        return this.notFound(ctx, 'Utilisateur bot non trouvé')
      }

      const calculations = await BotIgsCalculation.query()
        .where('bot_user_id', params.bot_user_id)
        .orderBy('created_at', 'desc')
        .paginate(page, limit)

      const formattedData = calculations.toJSON()
      formattedData.data = formattedData.data.map((calc: any) => ({
        id: calc.id,
        company_info: {
          name: calc.company_name,
          type: calc.company_type,
          sector: calc.sector,
          subcategory: calc.subcategory,
        },
        financial_data: {
          year_range: `${calc.previous_year}-${calc.current_year}`,
          previous_year_revenue: calc.previous_year_revenue,
          calculated_igs: calc.calculated_igs,
          formatted_igs: calc.calculated_igs.toLocaleString('fr-FR') + ' FCFA',
        },
        created_at: calc.created_at,
      }))

      return this.paginated(ctx, formattedData.data, {
        current_page: formattedData.meta.current_page,
        total_pages: formattedData.meta.last_page,
        per_page: formattedData.meta.per_page,
        total_items: formattedData.meta.total,
      })
    } catch (error) {
      return this.error(
        ctx,
        "Erreur lors de la récupération des calculs IGS de l'utilisateur",
        'IGS_USER_ERROR',
        500,
        error.message
      )
    }
  }
}
