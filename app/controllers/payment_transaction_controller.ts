import type { HttpContext } from '@adonisjs/core/http'
import BaseController from '#controllers/base_controller'
import { ErrorCodes } from '#services/response_formatter'
import EjaraPayService from '#services/ejara_pay_service'
import TaxRegistrationService from '#services/tax_registration_service'
import PaymentTransaction from '#models/rest-api/payment_transaction'
import User from '#models/rest-api/user'

export default class PaymentTransactionController extends BaseController {
  private ejaraPayService: EjaraPayService
  private taxRegistrationService: TaxRegistrationService

  constructor() {
    super()
    this.ejaraPayService = new EjaraPayService()
    this.taxRegistrationService = new TaxRegistrationService()
  }

  async index(ctx: HttpContext) {
    const { request } = ctx

    try {
      const page = request.input('page', 1)
      const limit = Math.min(request.input('limit', 20), 100)

      const filters = request.only([
        'status',
        'payment_mode',
        'tax_registration_request_id',
        'phone_number',
        'date_from',
        'date_to',
        'sort_by',
        'sort_order',
      ])

      let query = PaymentTransaction.query()

      if (filters.status) {
        query = query.where('status', filters.status)
      }

      if (filters.payment_mode) {
        query = query.where('paymentMode', filters.payment_mode)
      }

      if (filters.tax_registration_request_id) {
        query = query.where('taxRegistrationRequestId', filters.tax_registration_request_id)
      }

      if (filters.phone_number) {
        query = query.whereILike('phoneNumber', `%${filters.phone_number}%`)
      }

      if (filters.date_from) {
        query = query.where('createdAt', '>=', filters.date_from)
      }

      if (filters.date_to) {
        query = query.where('createdAt', '<=', filters.date_to)
      }

      const sortBy = filters.sort_by || 'created_at'
      const sortOrder = filters.sort_order === 'asc' ? 'asc' : 'desc'

      const allowedSortFields = [
        'created_at',
        'updated_at',
        'amount',
        'status',
        'payment_mode',
        'confirmed_at',
      ]

      if (allowedSortFields.includes(sortBy)) {
        query = query.orderBy(sortBy, sortOrder)
      }

      const transactions = await query.paginate(page, limit)
      const paginatedData = transactions.toJSON()

      return this.paginated(
        ctx,
        paginatedData.data,
        {
          current_page: paginatedData.meta.currentPage,
          total_pages: paginatedData.meta.lastPage,
          per_page: paginatedData.meta.perPage,
          total_items: paginatedData.meta.total,
        },
        'Payment transactions retrieved successfully'
      )
    } catch (error: any) {
      console.error('Error fetching payment transactions:', error)
      return this.error(ctx, 'Failed to fetch transactions', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  async store(ctx: HttpContext) {
    const { request } = ctx

    try {
      const payload = request.only([
        'tax_registration_request_id',
        'amount',
        'phone_number',
        'payment_mode',
        'full_name',
        'email_address',
      ])

      const errors: any = {}

      if (!payload.tax_registration_request_id) {
        errors.tax_registration_request_id = ['Tax registration request ID is required']
      }

      if (!payload.amount || payload.amount <= 0) {
        errors.amount = ['Amount must be greater than 0']
      }

      if (!payload.phone_number?.trim()) {
        errors.phone_number = ['Phone number is required']
      }

      if (!payload.payment_mode || !['MOMO', 'OM'].includes(payload.payment_mode)) {
        errors.payment_mode = ['Payment mode must be MOMO or OM']
      }

      if (!payload.full_name?.trim()) {
        errors.full_name = ['Full name is required']
      }

      if (!payload.email_address?.trim()) {
        errors.email_address = ['Email address is required']
      }

      // Validation format téléphone (Cameroun)
      if (payload.phone_number) {
        const phoneRegex = /^6[0-9]{8}$/
        if (!phoneRegex.test(payload.phone_number.trim())) {
          errors.phone_number = [
            'Phone number must be a valid Cameroon number (9 digits starting with 6)',
          ]
        }
      }

      // Validation email
      if (payload.email_address) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(payload.email_address.trim())) {
          errors.email_address = ['Invalid email address format']
        }
      }

      if (Object.keys(errors).length > 0) {
        return this.validationError(ctx, errors)
      }

      // Vérifier que la demande d'immatriculation existe et est en attente de paiement
      const taxRequest = await this.taxRegistrationService.findById(
        payload.tax_registration_request_id
      )
      if (!taxRequest) {
        return this.notFound(ctx, 'Tax registration request not found')
      }

      if (!taxRequest.isAwaitingPayment()) {
        return this.error(
          ctx,
          'Request is not awaiting payment',
          'REQUEST_NOT_AWAITING_PAYMENT',
          400
        )
      }

      // Initier le paiement
      const paymentResult = await this.ejaraPayService.createAndInitiatePayment(
        taxRequest.id,
        Number.parseFloat(payload.amount),
        payload.phone_number.trim(),
        payload.payment_mode,
        payload.full_name.trim(),
        payload.email_address.trim()
      )

      if (!paymentResult.success) {
        return this.error(ctx, paymentResult.message, 'PAYMENT_INITIATION_FAILED', 400)
      }

      // Démarrer le polling pour vérifier le statut
      if (paymentResult.transaction?.internalPaymentId) {
        this.ejaraPayService.pollTransactionStatus(paymentResult.transaction.internalPaymentId)
      }

      ctx.response.status(201)
      return this.success(
        ctx,
        {
          transaction: {
            id: paymentResult.transaction?.id,
            tax_registration_request_id: paymentResult.transaction?.taxRegistrationRequestId,
            external_reference: paymentResult.transaction?.externalReference,
            internal_payment_id: paymentResult.transaction?.internalPaymentId,
            status: paymentResult.transaction?.status,
            amount: paymentResult.transaction?.amount,
            payment_mode: paymentResult.transaction?.paymentMode,
            phone_number: paymentResult.transaction?.phoneNumber,
            created_at: paymentResult.transaction?.createdAt,
            provider_message: paymentResult.providerMessage,
          },
        },
        'Payment transaction initiated successfully. Please complete the payment on your mobile device.'
      )
    } catch (error: any) {
      console.error('Error creating payment transaction:', error)
      return this.error(ctx, 'Failed to initiate payment', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  async show(ctx: HttpContext) {
    const { params } = ctx

    try {
      const transaction = await PaymentTransaction.find(params.id)

      if (!transaction) {
        return this.notFound(ctx, 'Payment transaction not found')
      }

      await transaction.load('taxRegistrationRequest')

      return this.success(
        ctx,
        {
          transaction: {
            id: transaction.id,
            tax_registration_request_id: transaction.taxRegistrationRequestId,
            external_reference: transaction.externalReference,
            internal_payment_id: transaction.internalPaymentId,
            status: transaction.status,
            amount: transaction.amount,
            fees_amount: transaction.feesAmount,
            total_amount: transaction.totalAmount,
            payment_mode: transaction.paymentMode,
            phone_number: transaction.phoneNumber,
            confirmed_at: transaction.confirmedAt,
            created_at: transaction.createdAt,
            updated_at: transaction.updatedAt,
            provider_response: transaction.providerResponse,
            tax_registration_request: transaction.taxRegistrationRequest?.serialize(),
          },
        },
        'Payment transaction retrieved successfully'
      )
    } catch (error: any) {
      console.error('Error fetching payment transaction:', error)
      return this.error(ctx, 'Failed to fetch transaction', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  async checkStatus(ctx: HttpContext) {
    const { params } = ctx

    try {
      const transaction = await PaymentTransaction.find(params.id)

      if (!transaction) {
        return this.notFound(ctx, 'Payment transaction not found')
      }

      if (!transaction.internalPaymentId) {
        return this.error(
          ctx,
          'Transaction not yet initiated with payment provider',
          'TRANSACTION_NOT_INITIATED',
          400
        )
      }

      // Vérifier le statut auprès d'Ejara Pay
      const statusResult = await this.ejaraPayService.checkTransactionStatus(
        transaction.internalPaymentId
      )

      if (!statusResult.success) {
        return this.error(ctx, statusResult.message, 'PAYMENT_STATUS_CHECK_FAILED', 400)
      }

      // Mettre à jour la transaction avec les nouvelles données
      await this.ejaraPayService.processTransactionUpdate(transaction, statusResult.data)

      // Recharger la transaction pour avoir les dernières données
      await transaction.refresh()

      return this.success(
        ctx,
        {
          transaction: {
            id: transaction.id,
            external_reference: transaction.externalReference,
            internal_payment_id: transaction.internalPaymentId,
            status: transaction.status,
            amount: transaction.amount,
            fees_amount: transaction.feesAmount,
            total_amount: transaction.totalAmount,
            confirmed_at: transaction.confirmedAt,
            provider_message: transaction.getProviderMessage(),
            provider_reference: transaction.getProviderReference(),
            operator_reference: transaction.getOperatorReference(),
          },
        },
        'Transaction status updated successfully'
      )
    } catch (error: any) {
      console.error('Error checking payment status:', error)
      return this.error(
        ctx,
        'Failed to check payment status',
        ErrorCodes.INTERNAL_SERVER_ERROR,
        500
      )
    }
  }

  async getByRegistrationRequest(ctx: HttpContext) {
    const { params } = ctx

    try {
      const taxRegistrationRequestId = params.registration_id

      // Vérifier que la demande d'immatriculation existe
      const taxRequest = await this.taxRegistrationService.findById(taxRegistrationRequestId)
      if (!taxRequest) {
        return this.notFound(ctx, 'Tax registration request not found')
      }

      // Récupérer toutes les transactions pour cette demande
      const transactions =
        await PaymentTransaction.findByTaxRegistrationRequest(taxRegistrationRequestId)

      const transactionsData = transactions.map((transaction) => ({
        id: transaction.id,
        external_reference: transaction.externalReference,
        internal_payment_id: transaction.internalPaymentId,
        status: transaction.status,
        amount: transaction.amount,
        fees_amount: transaction.feesAmount,
        total_amount: transaction.totalAmount,
        payment_mode: transaction.paymentMode,
        phone_number: transaction.phoneNumber,
        confirmed_at: transaction.confirmedAt,
        created_at: transaction.createdAt,
        provider_message: transaction.getProviderMessage(),
      }))

      return this.success(
        ctx,
        {
          tax_registration_request_id: taxRegistrationRequestId,
          tax_registration_status: taxRequest.status,
          transactions: transactionsData,
          total_transactions: transactions.length,
          has_confirmed_payment: transactions.some((t) => t.isConfirmed()),
          has_pending_payment: transactions.some((t) => t.isPending() || t.isInitiated()),
        },
        'Payment transactions for registration request retrieved successfully'
      )
    } catch (error: any) {
      console.error('Error fetching transactions by registration request:', error)
      return this.error(ctx, 'Failed to fetch transactions', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  async getStats(ctx: HttpContext) {
    try {
      const [total, confirmed, pending, failed] = await Promise.all([
        PaymentTransaction.query().count('* as total'),
        PaymentTransaction.query().where('status', 'confirmed').count('* as total'),
        PaymentTransaction.query().whereIn('status', ['pending', 'initiated']).count('* as total'),
        PaymentTransaction.query().whereIn('status', ['rejected', 'failed']).count('* as total'),
      ])

      const [totalAmount, confirmedAmount] = await Promise.all([
        PaymentTransaction.query().sum('amount as total'),
        PaymentTransaction.query().where('status', 'confirmed').sum('total_amount as total'),
      ])

      const [byPaymentMode, byStatus] = await Promise.all([
        PaymentTransaction.query().select('paymentMode').count('* as total').groupBy('paymentMode'),
        PaymentTransaction.query().select('status').count('* as total').groupBy('status'),
      ])

      return this.success(
        ctx,
        {
          totals: {
            transactions: Number((total[0] as any).total),
            confirmed: Number((confirmed[0] as any).total),
            pending: Number((pending[0] as any).total),
            failed: Number((failed[0] as any).total),
          },
          amounts: {
            total_requested: Number((totalAmount[0] as any).total || 0),
            total_confirmed: Number((confirmedAmount[0] as any).total || 0),
          },
          by_payment_mode: byPaymentMode.reduce((acc: Record<string, number>, row: any) => {
            acc[row.paymentMode] = Number(row.total)
            return acc
          }, {}),
          by_status: byStatus.reduce((acc: Record<string, number>, row: any) => {
            acc[row.status] = Number(row.total)
            return acc
          }, {}),
          timestamp: new Date().toISOString(),
        },
        'Payment transaction statistics retrieved successfully'
      )
    } catch (error: any) {
      console.error('Error fetching payment statistics:', error)
      return this.error(ctx, 'Failed to fetch statistics', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }
}
