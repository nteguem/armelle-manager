import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Taxpayer from '#models/rest-api/tax_payer'
import DGIScraperService from '#services/dgi_scraper_service'
import { TaxpayerData } from '#types/taxpayer_types'
import BotUserTaxpayer from '#models/bot/bot_user_taxpayers'
import UserTaxpayer from '#models/rest-api/user_taxpayers'
import BotUser from '#models/bot/bot_user'

export default class TaxpayerService {
  private dgiScraperService: DGIScraperService

  constructor() {
    this.dgiScraperService = new DGIScraperService()
  }

  async createTaxpayer(
    data: TaxpayerData,
    creatorId: string,
    creatorType: 'bot_user' | 'admin',
    source: 'imported' | 'platform_created',
    taxRegistrationRequestId?: number
  ): Promise<Taxpayer> {
    const taxpayer = await Taxpayer.createFromData(
      data,
      creatorId,
      creatorType,
      source,
      taxRegistrationRequestId
    )

    if (creatorType === 'bot_user') {
      await this.linkBotUserToTaxpayer(creatorId, taxpayer.id, 'owner')
    } else {
      await this.assignTaxpayerToUser(Number.parseInt(creatorId), taxpayer.id, 'creator')
    }

    return taxpayer
  }

  async createAndLinkWithAsyncEnrichment(
    botUserId: string,
    taxpayerData: any
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log('🚀 Creating taxpayer with async enrichment - DETAILED:', {
        botUserId,
        taxpayerDataType: typeof taxpayerData,
        taxpayerDataKeys: taxpayerData ? Object.keys(taxpayerData) : 'NULL',
        nomRaisonSociale: taxpayerData?.nomRaisonSociale,
        prenomSigle: taxpayerData?.prenomSigle,
        centre: taxpayerData?.centre,
        niu: taxpayerData?.niu,
        fullTaxpayerData: taxpayerData,
      })

      // VALIDATION STRICTE
      if (!taxpayerData) {
        throw new Error('taxpayerData is null or undefined')
      }

      if (typeof taxpayerData !== 'object') {
        throw new Error(`taxpayerData should be object, got: ${typeof taxpayerData}`)
      }

      if (!taxpayerData.nomRaisonSociale) {
        throw new Error(`nomRaisonSociale is missing. Available keys: ${Object.keys(taxpayerData)}`)
      }

      const taxpayer = await this.createTaxpayer(
        {
          ...taxpayerData,
          centre: taxpayerData.centre || 'CENTRE EN VERIFICATION',
        },
        botUserId,
        'bot_user',
        'imported'
      )

      console.log('✅ Taxpayer created:', taxpayer.id)

      if (taxpayerData.niu && taxpayerData.niu.trim()) {
        this.enrichTaxpayerWithNiuVerification(taxpayer.id, taxpayerData.niu, botUserId).catch(
          (error) => console.error('❌ Background enrichment failed:', error)
        )
      }

      return {
        success: true,
        message: 'Contribuable créé, vérification NIU en arrière-plan',
      }
    } catch (error) {
      console.error('❌ Error in createAndLinkWithAsyncEnrichment:', error)
      throw new Error(`Failed to create taxpayer: ${error.message}`)
    }
  }

  /**
   * ENRICHISSEMENT ARRIÈRE-PLAN
   * Vérifie NIU et met à jour avec données complètes DGI
   */
  private async enrichTaxpayerWithNiuVerification(
    taxpayerId: string,
    niu: string,
    botUserId: string
  ): Promise<void> {
    try {
      console.log('🔍 Background NIU verification started:', niu)

      const niuResult = await this.dgiScraperService.verifierNIU(niu)

      if (niuResult.success && niuResult.data) {
        const taxpayer = await Taxpayer.findOrFail(taxpayerId)
        await taxpayer.updateFromDGI(niuResult.data)

        // Marquer utilisateur comme vérifié maintenant
        const botUser = await BotUser.find(botUserId)
        if (botUser) {
          await botUser.markAsVerified()
        }

        console.log('✅ Taxpayer enriched and user verified')
      } else {
        console.log('⚠️ NIU verification failed, keeping basic data')
      }
    } catch (error) {
      console.error('❌ Background enrichment error:', error)
    }
  }

  async updateTaxpayer(taxpayerId: string, data: Partial<TaxpayerData>): Promise<Taxpayer> {
    const taxpayer = await Taxpayer.findOrFail(taxpayerId)

    if (data.nomRaisonSociale) taxpayer.nomRaisonSociale = data.nomRaisonSociale.trim()
    if (data.prenomSigle !== undefined) taxpayer.prenomSigle = data.prenomSigle?.trim() || null
    if (data.numeroCniRc !== undefined) taxpayer.numeroCniRc = data.numeroCniRc?.trim() || null
    if (data.activite !== undefined) taxpayer.activite = data.activite?.trim() || null
    if (data.regime !== undefined) taxpayer.regime = data.regime?.trim() || null

    if (data.centre !== undefined) {
      const centreValue = data.centre?.trim()
      if (!centreValue || centreValue.length === 0) {
        throw new Error('Centre is required and cannot be empty')
      }
      taxpayer.centre = centreValue
    }

    if (data.etat !== undefined) taxpayer.etat = data.etat?.trim() || null
    if (data.phoneNumber !== undefined) taxpayer.phoneNumber = data.phoneNumber?.trim() || null
    if (data.dateNaissance !== undefined) {
      taxpayer.dateNaissance = data.dateNaissance ? DateTime.fromISO(data.dateNaissance) : null
    }

    await taxpayer.save()
    return taxpayer
  }

  async deleteTaxpayer(taxpayerId: string): Promise<void> {
    const taxpayer = await Taxpayer.findOrFail(taxpayerId)
    await taxpayer.load('associatedBotUsers')

    if (taxpayer.associatedBotUsers.length > 0) {
      throw new Error(
        `Cannot delete taxpayer. ${taxpayer.associatedBotUsers.length} bot user(s) are associated with this taxpayer.`
      )
    }

    await taxpayer.delete()
  }

  async linkBotUserToTaxpayer(
    botUserId: string,
    taxpayerId: string,
    relationshipType: 'owner' | 'linked' = 'linked'
  ): Promise<void> {
    const existing = await BotUserTaxpayer.query()
      .where('botUserId', botUserId)
      .where('taxpayerId', taxpayerId)
      .first()

    if (!existing) {
      await BotUserTaxpayer.create({
        botUserId,
        taxpayerId,
        relationshipType,
        linkedAt: DateTime.now(),
        updatedAt: DateTime.now(),
      })
    }
  }

  async assignTaxpayerToUser(
    userId: number,
    taxpayerId: string,
    relationshipType: 'creator' | 'manager' = 'manager'
  ): Promise<void> {
    const existing = await UserTaxpayer.query()
      .where('userId', userId)
      .where('taxpayerId', taxpayerId)
      .first()

    if (!existing) {
      await UserTaxpayer.create({
        userId: userId.toString(),
        taxpayerId,
        relationshipType,
        assignedAt: DateTime.now(),
        updatedAt: DateTime.now(),
      })
    }
  }

  async findTaxpayerById(id: string): Promise<Taxpayer | null> {
    return await Taxpayer.find(id)
  }

  async findTaxpayerByNIU(niu: string): Promise<Taxpayer | null> {
    return await Taxpayer.findByNIU(niu)
  }

  async getTaxpayersForBotUser(botUserId: string, filters: any = {}): Promise<Taxpayer[]> {
    let query = Taxpayer.query()
      .join('bot_user_taxpayers', 'taxpayers.id', 'bot_user_taxpayers.taxpayer_id')
      .where('bot_user_taxpayers.bot_user_id', botUserId)

    if (filters.relationshipType) {
      query = query.where('bot_user_taxpayers.relationship_type', filters.relationshipType)
    }

    return await query
  }

  async getTaxpayersForUser(userId: number, filters: any = {}): Promise<Taxpayer[]> {
    let query = Taxpayer.query()
      .join('user_taxpayers', 'taxpayers.id', 'user_taxpayers.taxpayer_id')
      .where('user_taxpayers.user_id', userId)

    if (filters.relationshipType) {
      query = query.where('user_taxpayers.relationship_type', filters.relationshipType)
    }

    return await query
  }

  async searchTaxpayers(filters: any = {}, pagination: any = {}): Promise<any> {
    const page = pagination.page || 1
    const limit = Math.min(pagination.limit || 20, 100)

    let query = Taxpayer.query()

    if (filters.search) {
      query = query.where((builder) => {
        builder
          .whereILike('niu', `%${filters.search}%`)
          .orWhereILike('nomRaisonSociale', `%${filters.search}%`)
          .orWhereILike('prenomSigle', `%${filters.search}%`)
          .orWhereILike('phoneNumber', `%${filters.search}%`)
      })
    }

    if (filters.type_contribuable) {
      if (Array.isArray(filters.type_contribuable)) {
        query = query.whereIn('typeContribuable', filters.type_contribuable)
      } else {
        query = query.where('typeContribuable', filters.type_contribuable)
      }
    }

    if (filters.etat) {
      if (Array.isArray(filters.etat)) {
        query = query.where((builder) => {
          filters.etat.forEach((etat: string, index: number) => {
            if (index === 0) {
              builder.whereILike('etat', `%${etat.trim()}%`)
            } else {
              builder.orWhereILike('etat', `%${etat.trim()}%`)
            }
          })
        })
      } else {
        query = query.whereILike('etat', `%${filters.etat}%`)
      }
    }

    if (filters.centre) {
      if (Array.isArray(filters.centre)) {
        query = query.where((builder) => {
          filters.centre.forEach((centre: string, index: number) => {
            const centreName = centre.trim()
            if (index === 0) {
              builder.whereILike('centre', `%${centreName}%`)
            } else {
              builder.orWhereILike('centre', `%${centreName}%`)
            }
          })
        })
      } else {
        const centreName = filters.centre.trim()
        query = query.whereILike('centre', `%${centreName}%`)
      }
    }

    if (filters.regime) {
      if (Array.isArray(filters.regime)) {
        query = query.where((builder) => {
          filters.regime.forEach((regime: string, index: number) => {
            if (index === 0) {
              builder.whereILike('regime', `%${regime.trim()}%`)
            } else {
              builder.orWhereILike('regime', `%${regime.trim()}%`)
            }
          })
        })
      } else {
        query = query.whereILike('regime', `%${filters.regime}%`)
      }
    }

    if (filters.phone_number) {
      query = query.whereILike('phoneNumber', `%${filters.phone_number}%`)
    }

    if (filters.source) {
      if (Array.isArray(filters.source)) {
        query = query.whereIn('source', filters.source)
      } else {
        query = query.where('source', filters.source)
      }
    }

    if (filters.created_by_type) {
      if (Array.isArray(filters.created_by_type)) {
        query = query.whereIn('createdByType', filters.created_by_type)
      } else {
        query = query.where('createdByType', filters.created_by_type)
      }
    }

    const sortBy = filters.sort_by || 'created_at'
    const sortOrder = filters.sort_order === 'asc' ? 'asc' : 'desc'

    const allowedSortFields = [
      'created_at',
      'updated_at',
      'nomRaisonSociale',
      'niu',
      'etat',
      'typeContribuable',
      'lastDgiCheck',
      'source',
    ]

    if (allowedSortFields.includes(sortBy)) {
      query = query.orderBy(sortBy, sortOrder)
    }

    return await query.paginate(page, limit)
  }

  async searchInDGI(criteria: { name?: string; birthDate?: string; niu?: string }): Promise<any> {
    const { name, birthDate, niu } = criteria

    if (niu) {
      return await this.dgiScraperService.verifierNIU(niu)
    } else if (name && birthDate) {
      return await this.dgiScraperService.rechercher(name, birthDate)
    } else if (name) {
      return await this.dgiScraperService.rechercherParNom(name)
    }

    throw new Error('Invalid search criteria')
  }

  async verifyNIUAndCreateTaxpayer(
    niu: string,
    userId: number,
    taxRegistrationRequestId: number
  ): Promise<{ success: boolean; message: string; taxpayer?: Taxpayer }> {
    try {
      const result = await this.dgiScraperService.verifierNIU(niu)

      if (!result.success || !result.data) {
        return {
          success: false,
          message: 'NIU not registered in DGI system',
        }
      }

      const taxpayer = await this.createTaxpayer(
        result.data,
        userId.toString(),
        'admin',
        'platform_created',
        taxRegistrationRequestId
      )

      return {
        success: true,
        message: 'Taxpayer created successfully from DGI data',
        taxpayer,
      }
    } catch (error) {
      console.error('Error verifying NIU and creating taxpayer:', error)
      return {
        success: false,
        message: 'Technical error during NIU verification',
      }
    }
  }

  async syncTaxpayerWithDGI(taxpayer: Taxpayer): Promise<string> {
    let result: any = null

    if (taxpayer.niu) {
      result = await this.dgiScraperService.verifierNIU(taxpayer.niu)
      if (result.success && result.data) {
        await taxpayer.updateFromDGI(result.data)
        return 'verified_by_niu'
      }
    }

    if (taxpayer.nomRaisonSociale && taxpayer.dateNaissance) {
      const dateFormatted = taxpayer.dateNaissance.toFormat('dd/MM/yyyy')
      result = await this.dgiScraperService.rechercher(taxpayer.nomRaisonSociale, dateFormatted)
      if (result.success && result.data && result.data.length > 0) {
        await taxpayer.updateFromDGI(result.data[0])
        return 'verified_by_name_and_birth'
      }
    }

    if (taxpayer.nomRaisonSociale) {
      result = await this.dgiScraperService.rechercherParNom(taxpayer.nomRaisonSociale)
      if (result.success && result.data && result.data.length > 0) {
        if (result.data.length === 1) {
          await taxpayer.updateFromDGI(result.data[0])
          return 'verified_by_name_single'
        } else {
          return 'multiple_results_found'
        }
      }
    }

    return 'not_found'
  }

  async getTaxpayerStats(taxpayerId: string): Promise<any> {
    const taxpayer = await Taxpayer.findOrFail(taxpayerId)
    return await taxpayer.getStats()
  }

  async getCentres(search: string = '', pagination: any = {}): Promise<any> {
    const page = pagination.page || 1
    const limit = Math.min(pagination.limit || 50, 100)

    let query = db
      .from('taxpayers')
      .select(
        'centre',
        db.raw('COUNT(*) as taxpayers_count'),
        db.raw('MIN(created_at) as first_discovered'),
        db.raw('MAX(last_dgi_check) as last_seen')
      )
      .groupBy('centre')

    if (search.trim()) {
      query = query.whereILike('centre', `%${search.trim()}%`)
    }

    query = query.orderBy('taxpayers_count', 'desc')

    const offset = (page - 1) * limit

    const totalQuery = query.clone()
    const totalRows = await totalQuery
    const total = totalRows.length

    const centres = await query.offset(offset).limit(limit)

    return {
      data: centres,
      pagination: {
        current_page: page,
        total_pages: Math.ceil(total / limit),
        per_page: limit,
        total_items: total,
      },
    }
  }

  async getCentreStats(): Promise<any> {
    const [centresWithData, centresEmpty] = await Promise.all([
      db
        .from('taxpayers')
        .select('centre', db.raw('COUNT(*) as count'))
        .whereNotNull('centre')
        .where('centre', '!=', '')
        .groupBy('centre')
        .orderBy('count', 'desc'),

      db
        .from('taxpayers')
        .count('* as count')
        .where((builder) => {
          builder.whereNull('centre').orWhere('centre', '')
        })
        .first(),
    ])

    return {
      centres_with_data: centresWithData,
      centres_without_data: Number(centresEmpty?.count || 0),
      total_centres: centresWithData.length,
      total_taxpayers:
        centresWithData.reduce((sum, centre) => sum + Number(centre.count), 0) +
        Number(centresEmpty?.count || 0),
    }
  }

  async testConnectivity(): Promise<any> {
    return await this.dgiScraperService.testConnectivity()
  }

  private normalizeFilters(filters: any): any {
    const normalized = { ...filters }

    const multipleFilterFields = [
      'centre',
      'etat',
      'regime',
      'type_contribuable',
      'source',
      'created_by_type',
    ]

    multipleFilterFields.forEach((field) => {
      if (normalized[field]) {
        if (typeof normalized[field] === 'string' && normalized[field].includes(',')) {
          normalized[field] = normalized[field]
            .split(',')
            .map((item: string) => item.trim())
            .filter((item: string) => item.length > 0)
        } else if (Array.isArray(normalized[field])) {
          normalized[field] = normalized[field]
            .map((item: string) => (typeof item === 'string' ? item.trim() : item))
            .filter((item: string) => item && item.length > 0)
        }
      }
    })

    return normalized
  }

  async searchTaxpayersWithNormalizedFilters(
    filters: any = {},
    pagination: any = {}
  ): Promise<any> {
    const normalizedFilters = this.normalizeFilters(filters)
    return this.searchTaxpayers(normalizedFilters, pagination)
  }

  async cleanup(): Promise<void> {
    await this.dgiScraperService.close()
  }
}
