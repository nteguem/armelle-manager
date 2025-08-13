import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import BotUser from './bot_user.js'
import { type TypeContribuable, TaxpayerData } from '#types/taxpayer_types'
import User from './user.js'
import BotUserTaxpayer from './bot_user_taxpayers.js'
import UserTaxpayer from './user_taxpayers.js'
import TaxRegistrationRequest from './tax_registration_request.js'

export default class Taxpayer extends BaseModel {
  static table = 'taxpayers'

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

  @column()
  declare centre: string | null

  @column()
  declare etat: string | null

  @column()
  declare typeContribuable: TypeContribuable

  @column()
  declare phoneNumber: string | null

  @column.date()
  declare dateNaissance: DateTime | null

  @column()
  declare createdById: string

  @column()
  declare createdByType: 'bot_user' | 'admin'

  @column()
  declare source: 'imported' | 'platform_created'

  @column()
  declare taxRegistrationRequestId: number | null

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
        console.error('Error stringifying dgiRawData:', error)
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
        console.error('Error parsing dgiRawData:', value, error)
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

  public isImported(): boolean {
    return this.source === 'imported'
  }

  public isPlatformCreated(): boolean {
    return this.source === 'platform_created'
  }

  public isFromRegistrationRequest(): boolean {
    return this.source === 'platform_created' && this.taxRegistrationRequestId !== null
  }

  public async getCreator(): Promise<BotUser | User | null> {
    if (this.createdByType === 'bot_user') {
      return await BotUser.find(this.createdById)
    }
    return await User.find(this.createdById)
  }

  public static getTypeFromNIU(niu: string): TypeContribuable {
    const firstChar = niu.charAt(0).toUpperCase()
    return firstChar === 'P' ? 'personne_physique' : 'personne_morale'
  }

  public isPersonnePhysique(): boolean {
    return this.typeContribuable === 'personne_physique'
  }

  public isPersonneMorale(): boolean {
    return this.typeContribuable === 'personne_morale'
  }

  public isActif(): boolean {
    return this.etat?.toLowerCase() === 'actif'
  }

  public getNomComplet(): string {
    if (this.isPersonnePhysique() && this.prenomSigle) {
      return `${this.prenomSigle} ${this.nomRaisonSociale}`
    }
    return this.nomRaisonSociale
  }

  public getNomAffichage(): string {
    if (this.isPersonneMorale()) {
      return this.prenomSigle
        ? `${this.nomRaisonSociale} (${this.prenomSigle})`
        : this.nomRaisonSociale
    }
    return this.getNomComplet()
  }

  public async updateDgiCheck(): Promise<void> {
    this.lastDgiCheck = DateTime.now()
    await this.save()
  }

  public static async createFromData(
    data: TaxpayerData,
    creatorId: string,
    creatorType: 'bot_user' | 'admin',
    source: 'imported' | 'platform_created',
    taxRegistrationRequestId?: number
  ): Promise<Taxpayer> {
    const typeContribuable = data.niu ? this.getTypeFromNIU(data.niu) : 'personne_physique'

    console.log('=== CREATE FROM DATA ===')
    console.log('creatorId:', creatorId)
    console.log('creatorType:', creatorType)
    console.log('source:', source)
    console.log('taxRegistrationRequestId:', taxRegistrationRequestId)

    return await this.create({
      niu: data.niu || null,
      nomRaisonSociale: data.nomRaisonSociale,
      prenomSigle: data.prenomSigle || null,
      numeroCniRc: data.numeroCniRc || null,
      activite: data.activite || null,
      regime: data.regime || null,
      centre: data.centre || null,
      etat: data.etat || null,
      phoneNumber: data.phoneNumber || null,
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

  public async updateFromDGI(dgiData: TaxpayerData): Promise<void> {
    this.nomRaisonSociale = dgiData.nomRaisonSociale
    this.prenomSigle = dgiData.prenomSigle || null
    this.numeroCniRc = dgiData.numeroCniRc || null
    this.activite = dgiData.activite || null
    this.regime = dgiData.regime || null
    this.centre = dgiData.centre || null
    this.etat = dgiData.etat || null
    this.dgiRawData = { ...this.dgiRawData, ...dgiData }
    this.lastDgiCheck = DateTime.now()

    await this.save()
  }

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
