import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import TaxRegistrationRequest from './tax_registration_request.js'

export default class PaymentTransaction extends BaseModel {
  static table = 'payment_transactions'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare taxRegistrationRequestId: number

  @column()
  declare amount: number

  @column()
  declare feesAmount: number | null

  @column()
  declare totalAmount: number | null

  @column()
  declare phoneNumber: string

  @column()
  declare paymentMode: 'MOMO' | 'OM'

  @column()
  declare status: 'pending' | 'initiated' | 'confirmed' | 'rejected' | 'failed'

  @column()
  declare internalPaymentId: string | null

  @column()
  declare externalReference: string

  @column({
    prepare: (value: Record<string, any> | null | undefined) => {
      if (value === null || value === undefined) {
        return '{}'
      }
      if (typeof value === 'string') {
        return value
      }
      try {
        return JSON.stringify(value)
      } catch (error) {
        console.error('Error stringifying providerResponse:', error)
        return '{}'
      }
    },
    consume: (value: string | null | undefined) => {
      if (!value || value === null || value === undefined) {
        return {}
      }
      if (typeof value === 'object') {
        return value
      }
      try {
        return JSON.parse(value)
      } catch (error) {
        console.error('Error parsing providerResponse:', value, error)
        return {}
      }
    },
  })
  declare providerResponse: Record<string, any>

  @column.dateTime()
  declare confirmedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => TaxRegistrationRequest, {
    foreignKey: 'taxRegistrationRequestId',
  })
  declare taxRegistrationRequest: BelongsTo<typeof TaxRegistrationRequest>

  public isPending(): boolean {
    return this.status === 'pending'
  }

  public isInitiated(): boolean {
    return this.status === 'initiated'
  }

  public isConfirmed(): boolean {
    return this.status === 'confirmed'
  }

  public isRejected(): boolean {
    return this.status === 'rejected'
  }

  public isFailed(): boolean {
    return this.status === 'failed'
  }

  public isFinal(): boolean {
    return this.isConfirmed() || this.isRejected() || this.isFailed()
  }

  public markAsInitiated(internalPaymentId: string, providerResponse: Record<string, any>): void {
    this.status = 'initiated'
    this.internalPaymentId = internalPaymentId
    this.providerResponse = { ...this.providerResponse, ...providerResponse }
  }

  public markAsConfirmed(
    feesAmount: number,
    totalAmount: number,
    providerResponse: Record<string, any>
  ): void {
    this.status = 'confirmed'
    this.feesAmount = feesAmount
    this.totalAmount = totalAmount
    this.confirmedAt = DateTime.now()
    this.providerResponse = { ...this.providerResponse, ...providerResponse }
  }

  public markAsRejected(providerResponse: Record<string, any>): void {
    this.status = 'rejected'
    this.providerResponse = { ...this.providerResponse, ...providerResponse }
  }

  public markAsFailed(providerResponse: Record<string, any>): void {
    this.status = 'failed'
    this.providerResponse = { ...this.providerResponse, ...providerResponse }
  }

  public updateProviderResponse(newResponse: Record<string, any>): void {
    this.providerResponse = { ...this.providerResponse, ...newResponse }
  }

  public getProviderReference(): string | null {
    return this.providerResponse?.providerReference || null
  }

  public getOperatorReference(): string | null {
    return this.providerResponse?.operatorReference || null
  }

  public getProviderMessage(): string | null {
    return this.providerResponse?.providerMessage || null
  }

  public static async createTransaction(
    taxRegistrationRequestId: number,
    amount: number,
    phoneNumber: string,
    paymentMode: 'MOMO' | 'OM',
    externalReference: string
  ): Promise<PaymentTransaction> {
    return await this.create({
      taxRegistrationRequestId,
      amount,
      phoneNumber,
      paymentMode,
      externalReference,
      status: 'pending',
      providerResponse: {},
    })
  }

  public static findByExternalReference(externalReference: string) {
    return this.query().where('externalReference', externalReference).first()
  }

  public static findByInternalPaymentId(internalPaymentId: string) {
    return this.query().where('internalPaymentId', internalPaymentId).first()
  }

  public static findByTaxRegistrationRequest(taxRegistrationRequestId: number) {
    return this.query().where('taxRegistrationRequestId', taxRegistrationRequestId)
  }

  public static confirmedTransactions() {
    return this.query().where('status', 'confirmed')
  }

  public static pendingTransactions() {
    return this.query().whereIn('status', ['pending', 'initiated'])
  }

  public static failedTransactions() {
    return this.query().whereIn('status', ['rejected', 'failed'])
  }
}
