import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import BotUser from './bot_user.js'
import { type TypeContribuable, TaxpayerData } from '#types/taxpayer_types'
import User from './user.js'
import BotUserTaxpayer from './bot_user_taxpayers.js'
import UserTaxpayer from './user_taxpayers.js'
import TaxRegistrationRequest from './tax_registration_request.js'

/**
 * Modèle Taxpayer - Gestion des contribuables
 *
 * @description Représente un contribuable dans le système avec toutes ses informations
 * fiscales et ses relations avec les utilisateurs et bots.
 *
 * @features
 * - Gestion des relations bot_users et admin users
 * - Synchronisation avec les données DGI
 * - Validation stricte des données obligatoires (centre)
 * - Support des filtres multiples et recherches avancées
 */
export default class Taxpayer extends BaseModel {
  static table = 'taxpayers'

  // ===============================================
  // COLONNES PRINCIPALES
  // ===============================================

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare niu: string | null

  @column()
  declare nomRaisonSociale: string

  @column()
  declare prenomSigle: string | null

  @column()
  declare numeroCniRc: string | null

  @column()
  declare activite: string | null

  @column()
  declare regime: string | null

  /** Centre fiscal - OBLIGATOIRE depuis la migration */
  @column()
  declare centre: string

  @column()
  declare etat: string | null

  @column()
  declare typeContribuable: TypeContribuable

  @column()
  declare phoneNumber: string | null

  @column.date()
  declare dateNaissance: DateTime | null

  // ===============================================
  // MÉTADONNÉES DE CRÉATION ET AUDIT
  // ===============================================

  @column()
  declare createdById: string

  @column()
  declare createdByType: 'bot_user' | 'admin'

  @column()
  declare source: 'imported' | 'platform_created'

  @column()
  declare taxRegistrationRequestId: number | null

  /**
   * Données brutes provenant du scraping DGI
   * Stockées en JSON pour conservation de l'historique
   */
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
      } catch {
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
      } catch {
        return {}
      }
    },
  })
  declare dgiRawData: Record<string, any>

  @column.dateTime()
  declare lastDgiCheck: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // ===============================================
  // RELATIONS
  // ===============================================

  @belongsTo(() => BotUser, {
    foreignKey: 'createdById',
  })
  declare botUserCreator: BelongsTo<typeof BotUser>

  @belongsTo(() => User, {
    foreignKey: 'createdById',
  })
  declare adminCreator: BelongsTo<typeof User>

  @belongsTo(() => TaxRegistrationRequest, {
    foreignKey: 'taxRegistrationRequestId',
  })
  declare taxRegistrationRequest: BelongsTo<typeof TaxRegistrationRequest>

  @manyToMany(() => BotUser, {
    localKey: 'id',
    pivotForeignKey: 'taxpayer_id',
    relatedKey: 'id',
    pivotRelatedForeignKey: 'bot_user_id',
    pivotTable: 'bot_user_taxpayers',
    pivotTimestamps: {
      createdAt: 'linked_at',
      updatedAt: 'updated_at',
    },
    pivotColumns: ['relationship_type'],
  })
  declare associatedBotUsers: ManyToMany<typeof BotUser>

  @manyToMany(() => User, {
    localKey: 'id',
    pivotForeignKey: 'taxpayer_id',
    relatedKey: 'id',
    pivotRelatedForeignKey: 'user_id',
    pivotTable: 'user_taxpayers',
    pivotTimestamps: {
      createdAt: 'assigned_at',
      updatedAt: 'updated_at',
    },
    pivotColumns: ['relationship_type'],
  })
  declare associatedUsers: ManyToMany<typeof User>

  @hasMany(() => BotUserTaxpayer, { foreignKey: 'taxpayerId' })
  declare botUserTaxpayers: HasMany<typeof BotUserTaxpayer>

  @hasMany(() => UserTaxpayer, { foreignKey: 'taxpayerId' })
  declare userTaxpayers: HasMany<typeof UserTaxpayer>

  // ===============================================
  // MÉTHODES D'INSTANCE - ÉTAT ET VALIDATION
  // ===============================================

  /**
   * Vérifie si le contribuable a été importé depuis une source externe
   */
  public isImported(): boolean {
    return this.source === 'imported'
  }

  /**
   * Vérifie si le contribuable a été créé via la plateforme
   */
  public isPlatformCreated(): boolean {
    return this.source === 'platform_created'
  }

  /**
   * Vérifie si le contribuable provient d'une demande d'enregistrement
   */
  public isFromRegistrationRequest(): boolean {
    return this.source === 'platform_created' && this.taxRegistrationRequestId !== null
  }

  /**
   * Récupère le créateur du contribuable (BotUser ou Admin User)
   */
  public async getCreator(): Promise<BotUser | User | null> {
    if (this.createdByType === 'bot_user') {
      return await BotUser.find(this.createdById)
    }
    return await User.find(this.createdById)
  }

  /**
   * Détermine le type de contribuable à partir du NIU
   * Règle: P = Personne Physique, autres = Personne Morale
   */
  public static getTypeFromNIU(niu: string): TypeContribuable {
    const firstChar = niu.charAt(0).toUpperCase()
    return firstChar === 'P' ? 'personne_physique' : 'personne_morale'
  }

  /**
   * Vérifie si c'est une personne physique
   */
  public isPersonnePhysique(): boolean {
    return this.typeContribuable === 'personne_physique'
  }

  /**
   * Vérifie si c'est une personne morale
   */
  public isPersonneMorale(): boolean {
    return this.typeContribuable === 'personne_morale'
  }

  /**
   * Vérifie si le contribuable est actif
   */
  public isActif(): boolean {
    return this.etat?.toLowerCase() === 'actif'
  }

  /**
   * Retourne le nom complet formaté selon le type de contribuable
   */
  public getNomComplet(): string {
    if (this.isPersonnePhysique() && this.prenomSigle) {
      return `${this.prenomSigle} ${this.nomRaisonSociale}`
    }
    return this.nomRaisonSociale
  }

  /**
   * Retourne le nom d'affichage optimisé pour l'interface utilisateur
   */
  public getNomAffichage(): string {
    if (this.isPersonneMorale()) {
      return this.prenomSigle
        ? `${this.nomRaisonSociale} (${this.prenomSigle})`
        : this.nomRaisonSociale
    }
    return this.getNomComplet()
  }

  /**
   * Met à jour le timestamp de la dernière vérification DGI
   */
  public async updateDgiCheck(): Promise<void> {
    this.lastDgiCheck = DateTime.now()
    await this.save()
  }

  // ===============================================
  // MÉTHODES STATIQUES - CRÉATION ET MISE À JOUR
  // ===============================================

  /**
   * Crée un nouveau contribuable à partir des données structurées
   *
   * @param data - Données du contribuable (centre obligatoire)
   * @param creatorId - ID du créateur
   * @param creatorType - Type de créateur ('bot_user' | 'admin')
   * @param source - Source de création ('imported' | 'platform_created')
   * @param taxRegistrationRequestId - ID de la demande d'enregistrement (optionnel)
   * @returns Promise<Taxpayer> - Nouveau contribuable créé
   * @throws Error si le centre n'est pas fourni ou vide
   */
  public static async createFromData(
    data: TaxpayerData,
    creatorId: string,
    creatorType: 'bot_user' | 'admin',
    source: 'imported' | 'platform_created',
    taxRegistrationRequestId?: number
  ): Promise<Taxpayer> {
    // Validation stricte : Centre obligatoire
    if (!data.centre || !data.centre.trim()) {
      throw new Error('Centre is required and cannot be empty')
    }

    // Validation : Nom/Raison sociale obligatoire
    if (!data.nomRaisonSociale || !data.nomRaisonSociale.trim()) {
      throw new Error('Nom/Raison sociale is required and cannot be empty')
    }

    const typeContribuable = data.niu ? this.getTypeFromNIU(data.niu) : 'personne_physique'

    return await this.create({
      niu: data.niu || null,
      nomRaisonSociale: data.nomRaisonSociale.trim(),
      prenomSigle: data.prenomSigle?.trim() || null,
      numeroCniRc: data.numeroCniRc?.trim() || null,
      activite: data.activite?.trim() || null,
      regime: data.regime?.trim() || null,
      centre: data.centre.trim(), // Garantie que centre est valide
      etat: data.etat?.trim() || null,
      phoneNumber: data.phoneNumber?.trim() || null,
      dateNaissance: data.dateNaissance ? DateTime.fromISO(data.dateNaissance) : null,
      typeContribuable,
      source,
      createdById: creatorId,
      createdByType: creatorType,
      taxRegistrationRequestId: taxRegistrationRequestId || null,
      dgiRawData: data,
      lastDgiCheck: DateTime.now(),
    })
  }

  /**
   * Met à jour les données du contribuable avec les informations DGI
   *
   * @param dgiData - Données fraîches provenant du DGI
   * @throws Error si le centre DGI n'est pas valide
   */
  public async updateFromDGI(dgiData: TaxpayerData): Promise<void> {
    // Validation : Centre obligatoire depuis les données DGI
    if (!dgiData.centre || !dgiData.centre.trim()) {
      throw new Error('Centre from DGI data is required and cannot be empty')
    }

    // Validation : Nom obligatoire
    if (!dgiData.nomRaisonSociale || !dgiData.nomRaisonSociale.trim()) {
      throw new Error('Nom/Raison sociale from DGI data is required and cannot be empty')
    }

    this.nomRaisonSociale = dgiData.nomRaisonSociale.trim()
    this.prenomSigle = dgiData.prenomSigle?.trim() || null
    this.numeroCniRc = dgiData.numeroCniRc?.trim() || null
    this.activite = dgiData.activite?.trim() || null
    this.regime = dgiData.regime?.trim() || null
    this.centre = dgiData.centre.trim() // Centre toujours valide
    this.etat = dgiData.etat?.trim() || null
    this.dgiRawData = { ...this.dgiRawData, ...dgiData }
    this.lastDgiCheck = DateTime.now()

    await this.save()
  }

  /**
   * Génère les statistiques du contribuable
   */
  public async getStats(): Promise<{
    nombreUtilisateurs: number
    derniereDGICheck: string | null
    typeAffichage: string
    statut: string
  }> {
    const utilisateursCount = await BotUserTaxpayer.query()
      .where('taxpayerId', this.id)
      .count('* as total')

    const nombreUtilisateurs = Number(utilisateursCount[0]?.$extras?.total || 0)

    return {
      nombreUtilisateurs,
      derniereDGICheck: this.lastDgiCheck?.toFormat('dd/MM/yyyy HH:mm') || null,
      typeAffichage: this.isPersonnePhysique() ? 'Personne Physique' : 'Personne Morale',
      statut: this.isActif() ? 'Actif' : 'Inactif',
    }
  }

  // ===============================================
  // QUERY SCOPES - MÉTHODES DE FILTRAGE
  // ===============================================

  public static actifs() {
    return this.query().whereILike('etat', 'actif')
  }

  public static personnesPhysiques() {
    return this.query().where('typeContribuable', 'personne_physique')
  }

  public static personnesMorales() {
    return this.query().where('typeContribuable', 'personne_morale')
  }

  public static findByNIU(niu: string) {
    return this.query().where('niu', niu).first()
  }

  public static searchByName(nomRaisonSociale: string) {
    return this.query().whereILike('nomRaisonSociale', `%${nomRaisonSociale}%`)
  }

  public static byCentre(centre: string) {
    return this.query().whereILike('centre', `%${centre}%`)
  }

  public static byRegime(regime: string) {
    return this.query().whereILike('regime', `%${regime}%`)
  }

  public static imported() {
    return this.query().where('source', 'imported')
  }

  public static platformCreated() {
    return this.query().where('source', 'platform_created')
  }

  public static fromRegistrationRequests() {
    return this.query().where('source', 'platform_created').whereNotNull('taxRegistrationRequestId')
  }

  public static createdBy(creatorId: string, creatorType: 'bot_user' | 'admin') {
    return this.query().where('createdById', creatorId).where('createdByType', creatorType)
  }

  public static needsCheck(daysOld: number = 30) {
    const checkDate = DateTime.now().minus({ days: daysOld }).toSQL()
    return this.query().where((query) => {
      query.whereNull('lastDgiCheck').orWhere('lastDgiCheck', '<', checkDate)
    })
  }

  public static withNIU() {
    return this.query().whereNotNull('niu')
  }

  public static withoutNIU() {
    return this.query().whereNull('niu')
  }
}
