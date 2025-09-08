import BotUser from '#models/bot/bot_user'
import BotIgsCalculation from '#models/bot/bot_igs_calculation'
import logger from '@adonisjs/core/services/logger'
import { randomUUID } from 'node:crypto'

interface Result {
  salary?: number
  igs: number
  netSalary?: number
  revenue?: number
}

interface CompanyData {
  userId: string
  sector: string
  subcategory: string
  previousYearRevenue: number
  currentYearEstimate: number
  companyType: string
  name: string
  phoneNumber: string
  city: string
  neighborhood: string
  niu: string
  calculatedIGS: number
}

interface SaveResult {
  success: boolean
  companyId?: string
  calculatedIGS?: number
  data?: any
  error?: string
}

export default class IGSService {
  /**
   * Calcule l'IGS basé sur le salaire (ancien système)
   */
  calculate(params: { salary: number }): Result {
    const salary = params.salary
    let igs = 0

    // Barème IGS Cameroun pour salariés
    if (salary > 300000) {
      igs += (Math.min(salary, 500000) - 300000) * 0.15
    }
    if (salary > 500000) {
      igs += (salary - 500000) * 0.25
    }

    return {
      salary,
      igs: Math.round(igs),
      netSalary: salary - Math.round(igs),
    }
  }

  /**
   * Calcule l'IGS basé sur le chiffre d'affaires (nouveau système)
   */
  calculateByRevenue(params: { revenue: number }): Result {
    const revenue = params.revenue
    let igs = 0

    // Barème IGS Cameroun par tranches de CA
    if (revenue < 500000) {
      igs = 20000
    } else if (revenue < 1000000) {
      igs = 30000
    } else if (revenue < 1500000) {
      igs = 40000
    } else if (revenue < 2000000) {
      igs = 50000
    } else if (revenue < 2500000) {
      igs = 50000
    } else if (revenue < 5000000) {
      igs = 60000
    } else if (revenue < 10000000) {
      igs = 150000
    } else if (revenue < 20000000) {
      igs = 300000
    } else if (revenue < 30000000) {
      igs = 500000
    } else {
      igs = 2000000
    }

    return {
      revenue,
      igs,
    }
  }

  /**
   * Sauvegarde les données d'entreprise avec calcul IGS en base de données
   */
  async saveCompanyData(params: CompanyData, context?: any): Promise<SaveResult> {
    try {
      logger.info(
        {
          userId: params.userId,
          companyName: params.name,
          revenue: params.previousYearRevenue,
        },
        'Saving company data for IGS calculation'
      )

      // Vérifier que l'utilisateur existe
      const botUser = await BotUser.find(params.userId)
      if (!botUser) {
        logger.error({ userId: params.userId }, 'Bot user not found for company creation')
        return {
          success: false,
          error: 'Utilisateur non trouvé',
        }
      }

      // Calculer l'IGS si pas déjà fait
      const calculatedIGS =
        params.calculatedIGS ||
        this.calculateByRevenue({
          revenue: params.previousYearRevenue,
        }).igs

      // Calculer les années automatiquement
      const currentDate = new Date()
      const currentYear = currentDate.getFullYear()
      const previousYear = currentYear - 1

      // Créer l'enregistrement en base de données
      const igsCalculation = await BotIgsCalculation.create({
        id: randomUUID(),
        botUserId: params.userId,
        sector: params.sector,
        subcategory: params.subcategory,
        previousYear: previousYear,
        currentYear: currentYear,
        previousYearRevenue: params.previousYearRevenue,
        currentYearEstimate: params.currentYearEstimate,
        companyType: params.companyType,
        companyName: params.name,
        phoneNumber: params.phoneNumber,
        city: params.city,
        neighborhood: params.neighborhood || null,
        niu: params.niu,
        calculatedIgs: calculatedIGS,
        calculationVersion: '1.0.0',
        rawWorkflowData: context ? context.state?.data || null : null,
      })

      logger.info(
        {
          userId: params.userId,
          calculatedIGS,
          calculationId: igsCalculation.id,
        },
        'IGS calculation saved successfully'
      )

      return {
        success: true,
        companyId: igsCalculation.id,
        calculatedIGS,
        data: igsCalculation,
      }
    } catch (error: any) {
      logger.error(
        {
          userId: params.userId,
          error: error.message,
          stack: error.stack,
        },
        'Error saving IGS calculation'
      )

      return {
        success: false,
        error: `Erreur lors de la sauvegarde: ${error.message}`,
      }
    }
  }

  /**
   * Récupère la dernière donnée d'entreprise d'un utilisateur
   */
  async getCompanyData(userId: string): Promise<CompanyData | null> {
    try {
      const calculation = await BotIgsCalculation.query()
        .where('botUserId', userId)
        .orderBy('createdAt', 'desc')
        .first()

      if (!calculation) {
        return null
      }

      return {
        userId: calculation.botUserId,
        sector: calculation.sector,
        subcategory: calculation.subcategory,
        previousYearRevenue: calculation.previousYearRevenue,
        currentYearEstimate: calculation.currentYearEstimate,
        companyType: calculation.companyType,
        name: calculation.companyName,
        phoneNumber: calculation.phoneNumber,
        city: calculation.city,
        neighborhood: calculation.neighborhood || '',
        niu: calculation.niu,
        calculatedIGS: calculation.calculatedIgs,
      }
    } catch (error: any) {
      logger.error(
        {
          userId,
          error: error.message,
        },
        'Error retrieving company data'
      )

      return null
    }
  }

  /**
   * Vérifie si un utilisateur a déjà des calculs IGS
   */
  async hasCompanyData(userId: string): Promise<boolean> {
    try {
      const count = await BotIgsCalculation.query().where('botUserId', userId).count('* as total')

      return count[0].$extras.total > 0
    } catch {
      return false
    }
  }

  /**
   * Récupère tous les calculs IGS d'un utilisateur (historique)
   */
  async getAllCalculations(userId: string): Promise<BotIgsCalculation[]> {
    try {
      return await BotIgsCalculation.query().where('botUserId', userId).orderBy('createdAt', 'desc')
    } catch (error: any) {
      logger.error(
        {
          userId,
          error: error.message,
        },
        'Error retrieving IGS calculations'
      )
      return []
    }
  }

  /**
   * Récupère un calcul IGS spécifique par ID
   */
  async getCalculationById(calculationId: string): Promise<BotIgsCalculation | null> {
    try {
      return await BotIgsCalculation.find(calculationId)
    } catch (error: any) {
      logger.error(
        {
          calculationId,
          error: error.message,
        },
        'Error retrieving IGS calculation by ID'
      )
      return null
    }
  }

  /**
   * Supprime tous les calculs IGS d'un utilisateur
   */
  async deleteCompanyData(userId: string): Promise<boolean> {
    try {
      await BotIgsCalculation.query().where('botUserId', userId).delete()

      logger.info({ userId }, 'IGS calculations deleted successfully')
      return true
    } catch (error: any) {
      logger.error(
        {
          userId,
          error: error.message,
        },
        'Error deleting IGS calculations'
      )
      return false
    }
  }

  /**
   * Calcule l'historique IGS pour différents montants de CA
   */
  calculateIGSScenarios(
    baseRevenue: number
  ): Array<{ revenue: number; igs: number; percentage: number }> {
    const scenarios = []
    const variations = [0.5, 0.8, 1.0, 1.2, 1.5, 2.0]

    for (const multiplier of variations) {
      const revenue = Math.round(baseRevenue * multiplier)
      const result = this.calculateByRevenue({ revenue })

      scenarios.push({
        revenue,
        igs: result.igs,
        percentage: Math.round((multiplier - 1) * 100),
      })
    }

    return scenarios
  }
}
