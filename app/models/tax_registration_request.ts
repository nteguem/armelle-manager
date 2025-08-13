// app/models/tax_registration_request.ts
import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import BotUser from './bot_user.js'

export default class TaxRegistrationRequest extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare contributorType:
    | 'individual_non_professional'
    | 'individual_professional'
    | 'legal_entity'

  @column()
  declare registrationData: string

  @column()
  declare status: 'awaiting_payment' | 'ready_for_review' | 'processed' | 'rejected'

  @column()
  declare generatedNiu: string | null

  @column()
  declare generatedPassword: string | null

  @column()
  declare documentPath: string | null

  @column()
  declare source: 'whatsapp_bot' | 'admin_dashboard'

  @column()
  declare createdByUserId: number | null

  @column()
  declare createdByBotUserId: string | null

  @column()
  declare processedByUserId: number | null

  @column()
  declare rejectionReason: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: false })
  declare processedAt: DateTime | null

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User, { foreignKey: 'createdByUserId' })
  declare createdByUser: BelongsTo<typeof User>

  @belongsTo(() => BotUser, { foreignKey: 'createdByBotUserId' })
  declare createdByBotUser: BelongsTo<typeof BotUser>

  @belongsTo(() => User, { foreignKey: 'processedByUserId' })
  declare processedByUser: BelongsTo<typeof User>

  public getRegistrationData() {
    return JSON.parse(this.registrationData)
  }

  public setRegistrationData(data: any) {
    this.registrationData = JSON.stringify(data)
  }

  public isAwaitingPayment(): boolean {
    return this.status === 'awaiting_payment'
  }

  public isReadyForReview(): boolean {
    return this.status === 'ready_for_review'
  }

  public isProcessed(): boolean {
    return this.status === 'processed'
  }

  public isRejected(): boolean {
    return this.status === 'rejected'
  }

  public markAsReadyForReview(): void {
    this.status = 'ready_for_review'
  }

  public markAsProcessed(
    niu: string,
    password: string,
    documentPath: string,
    userId: number
  ): void {
    this.status = 'processed'
    this.generatedNiu = niu
    this.generatedPassword = password
    this.documentPath = documentPath
    this.processedByUserId = userId
    this.processedAt = DateTime.now()
  }

  public markAsRejected(reason: string, userId: number): void {
    this.status = 'rejected'
    this.rejectionReason = reason
    this.processedByUserId = userId
    this.processedAt = DateTime.now()
  }

  public static scopeAwaitingPayment(query: any) {
    return query.where('status', 'awaiting_payment')
  }

  public static scopeReadyForReview(query: any) {
    return query.where('status', 'ready_for_review')
  }

  public static async createRequest(
    contributorType: string,
    registrationData: any,
    source: string,
    creatorId?: number | string
  ) {
    const data: any = {
      contributorType,
      registrationData: JSON.stringify(registrationData),
      status: 'awaiting_payment',
      source,
    }

    if (source === 'admin_dashboard' && creatorId) {
      data.createdByUserId = creatorId
    } else if (source === 'whatsapp_bot' && creatorId) {
      data.createdByBotUserId = creatorId
    }

    return this.create(data)
  }
}
