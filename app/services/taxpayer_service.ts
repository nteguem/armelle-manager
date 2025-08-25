import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Taxpayer from '#models/tax_payer'
import DGIScraperService from '#services/dgi_scraper_service'
import { TaxpayerData } from '#types/taxpayer_types'
import BotUserTaxpayer from '#models/bot_user_taxpayers'
import UserTaxpayer from '#models/user_taxpayers'

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

  // ✅ CORRECTION : Méthode updateTaxpayer avec validation stricte du centre
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

  /**
   * Recherche les contribuables avec support des filtres multiples avancés
   *
   * @description Méthode principale de recherche avec filtrage flexible.
   * Supporte les filtres simples (string) et multiples (array) pour une recherche granulaire.
   *
   * @param filters - Objet contenant les critères de filtrage
   * @param filters.search - Recherche textuelle globale (NIU, nom, prénom, téléphone)
   * @param filters.type_contribuable - Type(s) de contribuable (string | string[])
   * @param filters.etat - État(s) du contribuable (string | string[])
   * @param filters.centre - Centre(s) fiscal(aux) (string | string[]) - FONCTIONNALITÉ PRINCIPALE
   * @param filters.regime - Régime(s) fiscal(aux) (string | string[])
   * @param filters.phone_number - Numéro de téléphone (recherche partielle)
   * @param filters.source - Source(s) de création (string | string[])
   * @param filters.created_by_type - Type(s) de créateur (string | string[])
   * @param filters.sort_by - Champ de tri
   * @param filters.sort_order - Ordre de tri ('asc' | 'desc')
   * @param pagination - Paramètres de pagination
   * @param pagination.page - Numéro de page (défaut: 1)
   * @param pagination.limit - Nombre d'éléments par page (max: 100, défaut: 20)
   *
   * @returns Promise<any> - Résultats paginés avec métadonnées
   *
   * @example
   * // Recherche multi-centres
   * searchTaxpayers({ centre: ['Centre Nord', 'Douala'] })
   *
   * // Recherche multi-critères
   * searchTaxpayers({
   *   centre: ['Centre Nord', 'Centre Sud'],
   *   etat: ['Actif', 'Suspendu'],
   *   type_contribuable: 'PM'
   * })
   */
  async searchTaxpayers(filters: any = {}, pagination: any = {}): Promise<any> {
    const page = pagination.page || 1
    const limit = Math.min(pagination.limit || 20, 100)

    let query = Taxpayer.query()

    // ============================================
    // RECHERCHE TEXTUELLE GLOBALE
    // ============================================
    if (filters.search) {
      query = query.where((builder) => {
        builder
          .whereILike('niu', `%${filters.search}%`)
          .orWhereILike('nomRaisonSociale', `%${filters.search}%`)
          .orWhereILike('prenomSigle', `%${filters.search}%`)
          .orWhereILike('phoneNumber', `%${filters.search}%`)
      })
    }

    // ============================================
    // FILTRES MULTIPLES - TYPE DE CONTRIBUABLE
    // ============================================
    if (filters.type_contribuable) {
      if (Array.isArray(filters.type_contribuable)) {
        // Filtre exact pour les types (utilisation de whereIn pour performance)
        query = query.whereIn('typeContribuable', filters.type_contribuable)
      } else {
        query = query.where('typeContribuable', filters.type_contribuable)
      }
    }

    // ============================================
    // FILTRES MULTIPLES - ÉTAT DU CONTRIBUABLE
    // ============================================
    if (filters.etat) {
      if (Array.isArray(filters.etat)) {
        // Recherche flexible avec ILIKE pour supporter les variations de casse
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

    // ============================================
    // FILTRES MULTIPLES - CENTRES FISCAUX ⭐
    // ============================================
    if (filters.centre) {
      if (Array.isArray(filters.centre)) {
        // Support pour filtrage par plusieurs centres simultanément
        // Utilisation de OR pour inclure tous les centres spécifiés
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
        // Filtre simple par un seul centre
        const centreName = filters.centre.trim()
        query = query.whereILike('centre', `%${centreName}%`)
      }
    }

    // ============================================
    // FILTRES MULTIPLES - RÉGIMES FISCAUX
    // ============================================
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

    // ============================================
    // RECHERCHE SIMPLE - NUMÉRO DE TÉLÉPHONE
    // ============================================
    if (filters.phone_number) {
      query = query.whereILike('phoneNumber', `%${filters.phone_number}%`)
    }

    // ============================================
    // FILTRES MULTIPLES - SOURCE DE CRÉATION
    // ============================================
    if (filters.source) {
      if (Array.isArray(filters.source)) {
        // Filtre exact pour les sources (enum values)
        query = query.whereIn('source', filters.source)
      } else {
        query = query.where('source', filters.source)
      }
    }

    // ============================================
    // FILTRES MULTIPLES - TYPE DE CRÉATEUR
    // ============================================
    if (filters.created_by_type) {
      if (Array.isArray(filters.created_by_type)) {
        // Filtre exact pour les types de créateurs (enum values)
        query = query.whereIn('createdByType', filters.created_by_type)
      } else {
        query = query.where('createdByType', filters.created_by_type)
      }
    }

    // ============================================
    // TRI ET ORDERING
    // ============================================
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

  /**
   * Récupère tous les centres uniques
   * Le champ centre est maintenant toujours obligatoire et renseigné
   */
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

    // Compter le total pour la pagination
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

  /**
   * Nouvelle méthode pour obtenir les statistiques générales des centres
   * incluant les données nulles/vides si nécessaire
   */
  async getCentreStats(): Promise<any> {
    const [centresWithData, centresEmpty] = await Promise.all([
      // Centres avec des données
      db
        .from('taxpayers')
        .select('centre', db.raw('COUNT(*) as count'))
        .whereNotNull('centre')
        .where('centre', '!=', '')
        .groupBy('centre')
        .orderBy('count', 'desc'),

      // Centres vides ou nulls
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

  /**
   * Normalise et valide les filtres de recherche multiples
   *
   * @description Méthode utilitaire pour traiter les filtres reçus du frontend.
   * Convertit automatiquement les chaînes séparées par des virgules en tableaux
   * et nettoie les données pour éviter les erreurs de recherche.
   *
   * @private
   * @param filters - Objet de filtres bruts provenant de la requête HTTP
   * @returns Objet de filtres normalisés et validés
   *
   * @example
   * // Input: { centre: "Centre Nord,Douala, Centre Sud " }
   * // Output: { centre: ["Centre Nord", "Douala", "Centre Sud"] }
   */
  private normalizeFilters(filters: any): any {
    const normalized = { ...filters }

    /**
     * Configuration des champs supportant les filtres multiples
     * Ces champs peuvent accepter soit une string, soit un array de strings
     */
    const multipleFilterFields = [
      'centre', // Centres fiscaux - FONCTIONNALITÉ PRINCIPALE
      'etat', // États des contribuables
      'regime', // Régimes fiscaux
      'type_contribuable', // Types de contribuables
      'source', // Sources de création
      'created_by_type', // Types de créateurs
    ]

    multipleFilterFields.forEach((field) => {
      if (normalized[field]) {
        // Traitement des chaînes avec séparateurs de virgules
        if (typeof normalized[field] === 'string' && normalized[field].includes(',')) {
          normalized[field] = normalized[field]
            .split(',') // Séparer par virgules
            .map((item: string) => item.trim()) // Supprimer les espaces
            .filter((item: string) => item.length > 0) // Supprimer les valeurs vides
        }
        // Nettoyage des tableaux existants
        else if (Array.isArray(normalized[field])) {
          normalized[field] = normalized[field]
            .map((item: string) => (typeof item === 'string' ? item.trim() : item))
            .filter((item: string) => item && item.length > 0)
        }
      }
    })

    return normalized
  }

  /**
   * Point d'entrée principal pour la recherche avec normalisation des filtres
   *
   * @description Combine la normalisation des filtres et la recherche en une seule méthode.
   * Recommandée pour toutes les recherches provenant des endpoints publics.
   *
   * @param filters - Filtres bruts de la requête HTTP
   * @param pagination - Paramètres de pagination
   * @returns Promise<any> - Résultats de recherche paginés
   *
   * @example
   * // Depuis le contrôleur
   * const results = await service.searchTaxpayersWithNormalizedFilters({
   *   centre: "Centre Nord,Douala",
   *   etat: ["Actif", "Suspendu"]
   * }, { page: 1, limit: 20 })
   */
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
