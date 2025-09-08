import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BotUser from './bot_user.js'

export default class BotIgsCalculation extends BaseModel {
  static table = 'igs_calculations'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare botUserId: string

  // Données du workflow
  @column()
  declare sector: string

  @column()
  declare subcategory: string

  @column({ columnName: 'previous_year' })
  declare previousYear: number

  @column({ columnName: 'current_year' })
  declare currentYear: number

  @column({ columnName: 'previous_year_revenue' })
  declare previousYearRevenue: number

  @column({ columnName: 'current_year_estimate' })
  declare currentYearEstimate: number

  @column({ columnName: 'company_type' })
  declare companyType: string

  @column({ columnName: 'company_name' })
  declare companyName: string

  @column({ columnName: 'phone_number' })
  declare phoneNumber: string

  @column()
  declare city: string

  @column()
  declare neighborhood: string | null

  @column()
  declare niu: string

  // Résultat du calcul
  @column({ columnName: 'calculated_igs' })
  declare calculatedIgs: number

  // Métadonnées
  @column({ columnName: 'calculation_version' })
  declare calculationVersion: string

  @column({ columnName: 'raw_workflow_data' })
  declare rawWorkflowData: Record<string, any> | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => BotUser, { foreignKey: 'bot_user_id' })
  declare botUser: BelongsTo<typeof BotUser>

  // Méthodes utiles
  public get displayCompanyInfo(): string {
    return `${this.companyName} (${this.companyType})`
  }

  public get formattedIgs(): string {
    return this.calculatedIgs.toLocaleString('fr-FR') + ' FCFA'
  }

  public get formattedRevenue(): string {
    return this.previousYearRevenue.toLocaleString('fr-FR') + ' FCFA'
  }

  public get yearRange(): string {
    return `${this.previousYear}-${this.currentYear}`
  }

  // Scopes
  public static byBotUser(botUserId: string) {
    return this.query().where('botUserId', botUserId)
  }

  public static byYear(year: number) {
    return this.query().where('currentYear', year)
  }

  public static bySector(sector: string) {
    return this.query().where('sector', sector)
  }

  public static recent() {
    return this.query().orderBy('createdAt', 'desc')
  }
}
