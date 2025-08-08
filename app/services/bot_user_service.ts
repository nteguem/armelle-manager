import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BotUser from '#models/bot_user'
import Taxpayer from '#models/tax_payer'
import BotUserTaxpayer from '#models/bot_user_taxpayers'

export default class BotUserService {
  async createBotUser(data: {
    id?: string
    phoneNumber: string
    fullName?: string
    language?: 'fr' | 'en'
    registrationChannel?: string
    metadata?: Record<string, any>
  }): Promise<BotUser> {
    return await BotUser.create({
      id: data.id,
      phoneNumber: data.phoneNumber.trim(),
      fullName: data.fullName?.trim() || null,
      language: data.language || 'fr',
      isActive: true,
      isVerified: false,
      registrationChannel: data.registrationChannel || 'whatsapp',
      metadata: data.metadata || {},
    })
  }

  async findOrCreateBotUser(
    phoneNumber: string,
    data?: {
      fullName?: string
      language?: 'fr' | 'en'
      registrationChannel?: string
      metadata?: Record<string, any>
    }
  ): Promise<BotUser> {
    let botUser = await BotUser.query().where('phoneNumber', phoneNumber.trim()).first()

    if (!botUser) {
      botUser = await this.createBotUser({
        phoneNumber: phoneNumber.trim(),
        fullName: data?.fullName,
        language: data?.language,
        registrationChannel: data?.registrationChannel,
        metadata: data?.metadata,
      })
    }

    return botUser
  }

  async findBotUserById(id: string): Promise<BotUser | null> {
    return await BotUser.find(id)
  }

  async updateBotUser(id: string, data: any): Promise<BotUser> {
    const botUser = await BotUser.findOrFail(id)

    if (data.fullName !== undefined) botUser.fullName = data.fullName?.trim() || null
    if (data.language) botUser.language = data.language
    if (data.isActive !== undefined) botUser.isActive = data.isActive
    if (data.isVerified !== undefined) botUser.isVerified = data.isVerified
    if (data.registrationChannel) botUser.registrationChannel = data.registrationChannel

    if (data.metadata && typeof data.metadata === 'object') {
      botUser.metadata = { ...botUser.metadata, ...data.metadata }
    }

    await botUser.save()
    return botUser
  }

  async deleteBotUser(id: string): Promise<void> {
    const botUser = await BotUser.findOrFail(id)

    const taxpayersCount = await BotUserTaxpayer.query().where('botUserId', id).count('* as total')

    const count = Number(taxpayersCount[0]?.$extras?.total || 0)

    if (count > 0) {
      throw new Error(
        `Cannot delete bot user. ${count} taxpayer(s) are associated with this bot user.`
      )
    }

    await botUser.delete()
  }

  async searchBotUsers(filters: any = {}, pagination: any = {}): Promise<any> {
    const page = pagination.page || 1
    const limit = Math.min(pagination.limit || 20, 100)

    let query = BotUser.query()

    if (filters.search) {
      query = query.where((builder) => {
        builder
          .whereILike('phoneNumber', `%${filters.search}%`)
          .orWhereILike('fullName', `%${filters.search}%`)
      })
    }

    if (filters.language) {
      query = query.where('language', filters.language)
    }

    if (filters.isActive !== undefined) {
      query = query.where('isActive', filters.isActive)
    }

    if (filters.isVerified !== undefined) {
      query = query.where('isVerified', filters.isVerified)
    }

    if (filters.registrationChannel) {
      query = query.where('registrationChannel', filters.registrationChannel)
    }

    const sortBy = filters.sort_by || 'created_at'
    const sortOrder = filters.sort_order === 'asc' ? 'asc' : 'desc'

    const allowedSortFields = [
      'created_at',
      'updated_at',
      'phoneNumber',
      'fullName',
      'language',
      'isActive',
      'isVerified',
      'registrationChannel',
    ]

    if (allowedSortFields.includes(sortBy)) {
      query = query.orderBy(sortBy, sortOrder)
    }

    return await query.paginate(page, limit)
  }

  async getBotUserTaxpayers(botUserId: string, filters: any = {}): Promise<any> {
    let query = Taxpayer.query()
      .join('bot_user_taxpayers', 'taxpayers.id', 'bot_user_taxpayers.taxpayer_id')
      .where('bot_user_taxpayers.bot_user_id', botUserId)
      .select('taxpayers.*', 'bot_user_taxpayers.relationship_type', 'bot_user_taxpayers.linked_at')

    if (filters.relationshipType) {
      query = query.where('bot_user_taxpayers.relationship_type', filters.relationshipType)
    }

    if (filters.source) {
      query = query.where('taxpayers.source', filters.source)
    }

    if (filters.etat) {
      query = query.where('taxpayers.etat', filters.etat)
    }

    const sortBy = filters.sort_by || 'linked_at'
    const sortOrder = filters.sort_order === 'asc' ? 'asc' : 'desc'

    const allowedSortFields = [
      'linked_at',
      'taxpayers.created_at',
      'taxpayers.nom_raison_sociale',
      'taxpayers.niu',
    ]

    if (allowedSortFields.includes(sortBy)) {
      if (sortBy.includes('.')) {
        query = query.orderBy(sortBy, sortOrder)
      } else {
        query = query.orderBy(`bot_user_taxpayers.${sortBy}`, sortOrder)
      }
    }

    const page = filters.page || 1
    const limit = Math.min(filters.limit || 20, 100)

    return await query.paginate(page, limit)
  }

  async getBotUserStats(): Promise<any> {
    const totalUsers = await BotUser.query().count('* as total')
    const activeUsers = await BotUser.query().where('isActive', true).count('* as total')
    const verifiedUsers = await BotUser.query().where('isVerified', true).count('* as total')

    const usersByChannel = await BotUser.query()
      .select('registrationChannel')
      .count('* as count')
      .groupBy('registrationChannel')
      .orderBy('count', 'desc')

    const usersByLanguage = await BotUser.query()
      .select('language')
      .count('* as count')
      .groupBy('language')
      .orderBy('count', 'desc')

    const recentUsers = await BotUser.query()
      .where('createdAt', '>=', DateTime.now().minus({ days: 30 }).toSQL())
      .count('* as total')

    const usersWithTaxpayers = await db
      .from('bot_user_taxpayers')
      .countDistinct('bot_user_id as total')

    return {
      total: Number(totalUsers[0]?.$extras?.total || 0),
      active: Number(activeUsers[0]?.$extras?.total || 0),
      verified: Number(verifiedUsers[0]?.$extras?.total || 0),
      recentSignups: Number(recentUsers[0]?.$extras?.total || 0),
      withTaxpayers: Number(usersWithTaxpayers[0]?.total || 0),
      byChannel: usersByChannel.map((row) => ({
        channel: row.registrationChannel,
        count: Number(row.$extras?.count || 0),
      })),
      byLanguage: usersByLanguage.map((row) => ({
        language: row.language,
        count: Number(row.$extras?.count || 0),
      })),
    }
  }
}
