import TaxRegistrationRequest from '#models/rest-api/tax_registration_request'
import { RegistrationData } from '#types/registration_types'

export default class TaxRegistrationService {
  async createRequest(
    contributorType: string,
    registrationData: RegistrationData,
    source: string,
    creatorId?: number | string
  ): Promise<TaxRegistrationRequest> {
    return await TaxRegistrationRequest.createRequest(
      contributorType,
      registrationData,
      source,
      creatorId
    )
  }

  async findById(id: number): Promise<TaxRegistrationRequest | null> {
    return await TaxRegistrationRequest.find(id)
  }

  async updateRequest(
    id: number,
    data: Partial<RegistrationData>
  ): Promise<TaxRegistrationRequest> {
    const request = await TaxRegistrationRequest.findOrFail(id)

    if (!request.isAwaitingPayment()) {
      throw new Error('Cannot update processed or rejected request')
    }

    const currentData = request.getRegistrationData()
    const updatedData = { ...currentData, ...data }

    request.setRegistrationData(updatedData)
    await request.save()

    return request
  }

  async processRequest(
    id: number,
    niu: string,
    password: string,
    documentPath: string,
    userId: number
  ): Promise<TaxRegistrationRequest> {
    const request = await TaxRegistrationRequest.findOrFail(id)

    if (!request.isReadyForReview()) {
      throw new Error('Request must be ready for review to be processed')
    }

    request.markAsProcessed(niu, password, documentPath, userId)
    await request.save()

    return request
  }

  async rejectRequest(id: number, reason: string, userId: number): Promise<TaxRegistrationRequest> {
    const request = await TaxRegistrationRequest.findOrFail(id)

    if (!request.isReadyForReview()) {
      throw new Error('Request must be ready for review to be rejected')
    }

    request.markAsRejected(reason, userId)
    await request.save()

    return request
  }

  async searchRequests(filters: any = {}, pagination: any = {}): Promise<any> {
    const page = pagination.page || 1
    const limit = Math.min(pagination.limit || 20, 100)

    let query = TaxRegistrationRequest.query()

    if (filters.search) {
      query = query.where((builder) => {
        builder
          .whereILike('generated_niu', `%${filters.search}%`)
          .orWhereRaw('registration_data::text ILIKE ?', [`%${filters.search}%`])
      })
    }

    if (filters.contributor_type) {
      query = query.where('contributor_type', filters.contributor_type)
    }

    if (filters.status) {
      query = query.where('status', filters.status)
    }

    if (filters.source) {
      query = query.where('source', filters.source)
    }

    if (filters.created_by_user_id) {
      query = query.where('created_by_user_id', filters.created_by_user_id)
    }

    if (filters.created_by_bot_user_id) {
      query = query.where('created_by_bot_user_id', filters.created_by_bot_user_id)
    }

    if (filters.date_from) {
      query = query.where('created_at', '>=', filters.date_from)
    }

    if (filters.date_to) {
      query = query.where('created_at', '<=', filters.date_to)
    }

    const sortBy = filters.sort_by || 'created_at'
    const sortOrder = filters.sort_order === 'asc' ? 'asc' : 'desc'

    const allowedSortFields = [
      'created_at',
      'updated_at',
      'status',
      'contributor_type',
      'processed_at',
      'source',
    ]

    if (allowedSortFields.includes(sortBy)) {
      query = query.orderBy(sortBy, sortOrder)
    }

    return await query.paginate(page, limit)
  }

  async getRequestsByStatus(status: string): Promise<TaxRegistrationRequest[]> {
    return await TaxRegistrationRequest.query().where('status', status)
  }

  async getAwaitingPaymentRequests(): Promise<TaxRegistrationRequest[]> {
    return await TaxRegistrationRequest.query().where('status', 'awaiting_payment')
  }

  async getReadyForReviewRequests(): Promise<TaxRegistrationRequest[]> {
    return await TaxRegistrationRequest.query().where('status', 'ready_for_review')
  }

  async getStats(): Promise<any> {
    const [total, awaitingPayment, readyForReview, processed, rejected] = await Promise.all([
      TaxRegistrationRequest.query().count('* as total'),
      TaxRegistrationRequest.query().where('status', 'awaiting_payment').count('* as total'),
      TaxRegistrationRequest.query().where('status', 'ready_for_review').count('* as total'),
      TaxRegistrationRequest.query().where('status', 'processed').count('* as total'),
      TaxRegistrationRequest.query().where('status', 'rejected').count('* as total'),
    ])

    return {
      total: Number((total[0] as any).total),
      by_status: {
        awaiting_payment: Number((awaitingPayment[0] as any).total),
        ready_for_review: Number((readyForReview[0] as any).total),
        processed: Number((processed[0] as any).total),
        rejected: Number((rejected[0] as any).total),
      },
    }
  }

  async getRequestsByContributorType(): Promise<Record<string, number>> {
    const results = await TaxRegistrationRequest.query()
      .select('contributor_type')
      .count('* as total')
      .groupBy('contributor_type')

    return results.reduce((acc: Record<string, number>, row: any) => {
      acc[row.contributorType] = Number(row.total)
      return acc
    }, {})
  }

  async getRequestsBySource(): Promise<Record<string, number>> {
    const results = await TaxRegistrationRequest.query()
      .select('source')
      .count('* as total')
      .groupBy('source')

    return results.reduce((acc: Record<string, number>, row: any) => {
      acc[row.source] = Number(row.total)
      return acc
    }, {})
  }
}
