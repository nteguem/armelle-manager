import type { HttpContext } from '@adonisjs/core/http'
import BaseController from '#controllers/base_controller'
import { ErrorCodes } from '#services/response_formatter'
import TaxRegistrationService from '#services/tax_registration_service'
import TaxpayerService from '#services/taxpayer_service'
import User from '#models/user'
import FileUploadService from '#services/file_upload_service'

export default class TaxRegistrationController extends BaseController {
  private taxRegistrationService: TaxRegistrationService
  private taxpayerService: TaxpayerService
  private fileUploadService: FileUploadService

  constructor() {
    super()
    this.taxRegistrationService = new TaxRegistrationService()
    this.taxpayerService = new TaxpayerService()
    this.fileUploadService = new FileUploadService()
  }

  async index(ctx: HttpContext) {
    const { request } = ctx

    try {
      const page = request.input('page', 1)
      const limit = Math.min(request.input('limit', 20), 100)

      const filters = request.only([
        'search',
        'contributor_type',
        'status',
        'source',
        'created_by_user_id',
        'created_by_bot_user_id',
        'date_from',
        'date_to',
        'sort_by',
        'sort_order',
      ])

      const requests = await this.taxRegistrationService.searchRequests(filters, { page, limit })
      const paginatedData = requests.toJSON()

      return this.paginated(
        ctx,
        paginatedData.data,
        {
          current_page: paginatedData.meta.currentPage,
          total_pages: paginatedData.meta.lastPage,
          per_page: paginatedData.meta.perPage,
          total_items: paginatedData.meta.total,
        },
        'Tax registration requests retrieved successfully'
      )
    } catch (error: any) {
      console.error('Error fetching tax registration requests:', error)
      return this.error(ctx, 'Failed to fetch requests', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  async store(ctx: HttpContext) {
    const { request } = ctx
    try {
      const payload = request.only(['contributor_type', 'registration_data'])

      const errors: any = {}

      if (!payload.contributor_type) {
        errors.contributor_type = ['Contributor type is required']
      }

      const validTypes = ['individual_non_professional', 'individual_professional', 'legal_entity']
      if (payload.contributor_type && !validTypes.includes(payload.contributor_type)) {
        errors.contributor_type = ['Invalid contributor type']
      }

      if (!payload.registration_data) {
        errors.registration_data = ['Registration data is required']
      }

      if (payload.registration_data) {
        if (!payload.registration_data.personalInfo?.fullName?.trim()) {
          errors.registration_data = ['Personal info with full name is required']
        }
        if (!payload.registration_data.contactInfo?.phoneNumber?.trim()) {
          errors.registration_data = ['Contact info with phone number is required']
        }
      }

      if (Object.keys(errors).length > 0) {
        return this.validationError(ctx, errors)
      }

      const user = ctx.user as User
      const newRequest = await this.taxRegistrationService.createRequest(
        payload.contributor_type,
        payload.registration_data,
        'admin_dashboard',
        user.id
      )

      ctx.response.status(201)
      return this.success(
        ctx,
        {
          request: {
            id: newRequest.id,
            contributor_type: newRequest.contributorType,
            status: newRequest.status,
            source: newRequest.source,
            created_at: newRequest.createdAt,
          },
        },
        'Tax registration request created successfully'
      )
    } catch (error: any) {
      console.error('Error creating tax registration request:', error)
      return this.error(ctx, 'Failed to create request', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  async show(ctx: HttpContext) {
    const { params } = ctx

    try {
      const taxRequest = await this.taxRegistrationService.findById(params.id)

      if (!taxRequest) {
        return this.notFound(ctx, 'Tax registration request not found')
      }

      await taxRequest.load('createdByUser')
      await taxRequest.load('createdByBotUser')
      await taxRequest.load('processedByUser')

      return this.success(
        ctx,
        {
          request: {
            id: taxRequest.id,
            contributor_type: taxRequest.contributorType,
            registration_data: taxRequest.getRegistrationData(),
            status: taxRequest.status,
            generated_niu: taxRequest.generatedNiu,
            document_path: taxRequest.documentPath,
            source: taxRequest.source,
            created_by_user: taxRequest.createdByUser?.serialize(),
            created_by_bot_user: taxRequest.createdByBotUser?.serialize(),
            processed_by_user: taxRequest.processedByUser?.serialize(),
            rejection_reason: taxRequest.rejectionReason,
            processed_at: taxRequest.processedAt,
            created_at: taxRequest.createdAt,
            updated_at: taxRequest.updatedAt,
          },
        },
        'Tax registration request retrieved successfully'
      )
    } catch (error: any) {
      console.error('Error fetching tax registration request:', error)
      return this.error(ctx, 'Failed to fetch request', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  async update(ctx: HttpContext) {
    const { params, request } = ctx

    try {
      const existingRequest = await this.taxRegistrationService.findById(params.id)

      if (!existingRequest) {
        return this.notFound(ctx, 'Tax registration request not found')
      }

      const payload = request.only(['registration_data'])

      if (!payload.registration_data) {
        return this.validationError(ctx, {
          registration_data: ['Registration data is required'],
        })
      }

      const updatedRequest = await this.taxRegistrationService.updateRequest(
        existingRequest.id,
        payload.registration_data
      )

      return this.success(
        ctx,
        {
          request: {
            id: updatedRequest.id,
            contributor_type: updatedRequest.contributorType,
            status: updatedRequest.status,
            updated_at: updatedRequest.updatedAt,
          },
        },
        'Tax registration request updated successfully'
      )
    } catch (error: any) {
      if (error.message.includes('Cannot update')) {
        return this.error(ctx, error.message, 'REQUEST_NOT_UPDATABLE', 400)
      }
      console.error('Error updating tax registration request:', error)
      return this.error(ctx, 'Failed to update request', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  async process(ctx: HttpContext) {
    const { params, request } = ctx

    try {
      const payload = request.only(['niu', 'password', 'document_path'])

      const errors: any = {}

      if (!payload.niu?.trim()) {
        errors.niu = ['NIU is required']
      }

      if (!payload.password?.trim()) {
        errors.password = ['Password is required']
      }

      if (!payload.document_path?.trim()) {
        errors.document_path = ['Document path is required']
      }

      if (Object.keys(errors).length > 0) {
        return this.validationError(ctx, errors)
      }

      const user = ctx.user as User
      const requestId = params.id
      const niu = payload.niu.trim()

      // Vérifier que la demande existe et est prête pour traitement
      const taxRequest = await this.taxRegistrationService.findById(requestId)
      if (!taxRequest) {
        return this.notFound(ctx, 'Tax registration request not found')
      }

      if (!taxRequest.isReadyForReview()) {
        return this.error(
          ctx,
          'Request must be ready for review to be processed',
          'REQUEST_NOT_PROCESSABLE',
          400
        )
      }

      // Vérifier le NIU avec DGI et créer le taxpayer
      const niuVerificationResult = await this.taxpayerService.verifyNIUAndCreateTaxpayer(
        niu,
        user.id,
        requestId
      )

      if (!niuVerificationResult.success) {
        return this.error(ctx, niuVerificationResult.message, 'NIU_NOT_REGISTERED_DGI', 400)
      }

      // Traiter la demande (marquer comme processed)
      const processedRequest = await this.taxRegistrationService.processRequest(
        requestId,
        niu,
        payload.password.trim(),
        payload.document_path.trim(),
        user.id
      )

      return this.success(
        ctx,
        {
          request: {
            id: processedRequest.id,
            status: processedRequest.status,
            generated_niu: processedRequest.generatedNiu,
            generated_password: processedRequest.generatedPassword,
            document_path: processedRequest.documentPath,
            processed_at: processedRequest.processedAt,
          },
          taxpayer: {
            id: niuVerificationResult.taxpayer?.id,
            niu: niuVerificationResult.taxpayer?.niu,
            nom_raison_sociale: niuVerificationResult.taxpayer?.nomRaisonSociale,
            source: niuVerificationResult.taxpayer?.source,
            tax_registration_request_id: niuVerificationResult.taxpayer?.taxRegistrationRequestId,
          },
        },
        'Tax registration request processed and taxpayer created successfully'
      )
    } catch (error: any) {
      if (error.message.includes('must be ready for review')) {
        return this.error(ctx, error.message, 'REQUEST_NOT_PROCESSABLE', 400)
      }
      console.error('Error processing tax registration request:', error)
      return this.error(ctx, 'Failed to process request', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  async reject(ctx: HttpContext) {
    const { params, request } = ctx

    try {
      const payload = request.only(['reason'])

      if (!payload.reason?.trim()) {
        return this.validationError(ctx, {
          reason: ['Rejection reason is required'],
        })
      }

      const user = ctx.user as User
      const rejectedRequest = await this.taxRegistrationService.rejectRequest(
        params.id,
        payload.reason.trim(),
        user.id
      )

      return this.success(
        ctx,
        {
          request: {
            id: rejectedRequest.id,
            status: rejectedRequest.status,
            rejection_reason: rejectedRequest.rejectionReason,
            processed_at: rejectedRequest.processedAt,
          },
        },
        'Tax registration request rejected successfully'
      )
    } catch (error: any) {
      if (error.message.includes('must be ready for review')) {
        return this.error(ctx, error.message, 'REQUEST_NOT_REJECTABLE', 400)
      }
      console.error('Error rejecting tax registration request:', error)
      return this.error(ctx, 'Failed to reject request', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  async getStats(ctx: HttpContext) {
    try {
      const [stats, byType, bySource] = await Promise.all([
        this.taxRegistrationService.getStats(),
        this.taxRegistrationService.getRequestsByContributorType(),
        this.taxRegistrationService.getRequestsBySource(),
      ])

      return this.success(
        ctx,
        {
          stats,
          by_contributor_type: byType,
          by_source: bySource,
          timestamp: new Date().toISOString(),
        },
        'Statistics retrieved successfully'
      )
    } catch (error: any) {
      console.error('Error fetching statistics:', error)
      return this.error(ctx, 'Failed to fetch statistics', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  /**
   * Upload un document pour une demande d'immatriculation
   */
  async uploadDocument(ctx: HttpContext) {
    try {
      const { request } = ctx

      const documentFile = request.file('document', {
        size: '10mb',
        extnames: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'],
      })

      if (!documentFile) {
        return this.validationError(ctx, {
          document: ['Document file is required'],
        })
      }

      if (documentFile.hasErrors) {
        const errors = documentFile.errors.map((error) => error.message)
        return this.validationError(ctx, {
          document: errors,
        })
      }

      const requestId = request.input('request_id')
        ? Number.parseInt(request.input('request_id'))
        : undefined

      const uploadResult = await this.fileUploadService.uploadTaxRegistrationDocument(
        documentFile,
        requestId
      )

      if (!uploadResult.success) {
        return this.error(ctx, uploadResult.message, 'FILE_UPLOAD_FAILED', 400)
      }

      return this.success(
        ctx,
        {
          document_url: uploadResult.url,
          metadata: uploadResult.metadata,
        },
        'Document uploaded successfully'
      )
    } catch (error: any) {
      console.error('Error uploading document:', error)
      return this.error(ctx, 'Failed to upload document', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }
}
