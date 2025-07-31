import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import BotUser from './bot_user.js'
import { type TypeContribuable, TaxpayerStatus, TaxpayerData } from '#types/taxpayer_types'

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
  declare status: TaxpayerStatus

  @column()
  declare phoneNumber: string | null

  @column.date()
  declare dateNaissance: DateTime | null

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

  /**
   * Relations
   */
  @hasMany(() => BotUser)
  declare botUsers: HasMany<typeof BotUser>

  /**
   * Méthodes métier
   */

  /**
   * Détermine le type de contribuable à partir du NIU
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
   * Vérifie si le contribuable est vérifié et trouvé dans la DGI
   */
  public isVerifiedFound(): boolean {
    return this.status === TaxpayerStatus.VERIFIED_FOUND
  }

  /**
   * Vérifie si le contribuable a été vérifié (trouvé ou non)
   */
  public isVerified(): boolean {
    return (
      this.status === TaxpayerStatus.VERIFIED_FOUND ||
      this.status === TaxpayerStatus.VERIFIED_NOT_FOUND
    )
  }

  /**
   * Récupère le nom complet formaté
   */
  public getNomComplet(): string {
    if (this.isPersonnePhysique() && this.prenomSigle) {
      return `${this.prenomSigle} ${this.nomRaisonSociale}`
    }
    return this.nomRaisonSociale
  }

  /**
   * Récupère le nom d'affichage selon le type
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
   * Met à jour la dernière vérification DGI
   */
  public async updateDgiCheck(): Promise<void> {
    this.lastDgiCheck = DateTime.now()
    await this.save()
  }

  /**
   * Crée un contribuable à partir des données (avec ou sans DGI)
   */
  public static async createFromData(data: TaxpayerData): Promise<Taxpayer> {
    const typeContribuable = data.niu ? this.getTypeFromNIU(data.niu) : 'personne_physique' // Default si pas de NIU

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
      status: TaxpayerStatus.NOT_YET_CHECKED,
      dgiRawData: {},
      lastDgiCheck: null,
    })
  }

  /**
   * Met à jour avec de nouvelles données DGI
   */
  public async updateFromDGI(dgiData: TaxpayerData): Promise<void> {
    this.nomRaisonSociale = dgiData.nomRaisonSociale
    this.prenomSigle = dgiData.prenomSigle || null
    this.numeroCniRc = dgiData.numeroCniRc || null
    this.activite = dgiData.activite || null
    this.regime = dgiData.regime || null
    this.centre = dgiData.centre || null
    this.etat = dgiData.etat || null
    this.status = TaxpayerStatus.VERIFIED_FOUND
    this.dgiRawData = { ...this.dgiRawData, ...dgiData }
    this.lastDgiCheck = DateTime.now()

    await this.save()
  }

  /**
   * Marque comme non trouvé dans la DGI
   */
  public async markAsNotFoundInDGI(): Promise<void> {
    this.status = TaxpayerStatus.VERIFIED_NOT_FOUND
    this.lastDgiCheck = DateTime.now()
    await this.save()
  }

  /**
   * Récupère les statistiques du contribuable
   */
  public async getStats(): Promise<{
    nombreUtilisateurs: number
    derniereDGICheck: string | null
    typeAffichage: string
    statut: string
    statusDGI: string
  }> {
    const utilisateursCount = await BotUser.query()
      .where('taxpayer_id', this.id)
      .count('* as total')

    const nombreUtilisateurs = Number(utilisateursCount[0]?.$extras?.total || 0)

    const statusLabels = {
      [TaxpayerStatus.NOT_YET_CHECKED]: 'Non vérifié',
      [TaxpayerStatus.VERIFIED_FOUND]: 'Vérifié - Trouvé',
      [TaxpayerStatus.VERIFIED_NOT_FOUND]: 'Vérifié - Non trouvé',
    }

    return {
      nombreUtilisateurs,
      derniereDGICheck: this.lastDgiCheck?.toFormat('dd/MM/yyyy HH:mm') || null,
      typeAffichage: this.isPersonnePhysique() ? 'Personne Physique' : 'Personne Morale',
      statut: this.isActif() ? 'Actif' : 'Inactif',
      statusDGI: statusLabels[this.status],
    }
  }

  /**
   * Scopes de requête
   */

  /**
   * Contribuables actifs seulement
   */
  public static actifs() {
    return this.query().whereILike('etat', 'actif')
  }

  /**
   * Personnes physiques seulement
   */
  public static personnesPhysiques() {
    return this.query().where('typeContribuable', 'personne_physique')
  }

  /**
   * Personnes morales seulement
   */
  public static personnesMorales() {
    return this.query().where('typeContribuable', 'personne_morale')
  }

  /**
   * Recherche par NIU
   */
  public static findByNIU(niu: string) {
    return this.query().where('niu', niu).first()
  }

  /**
   * Recherche par nom (insensible à la casse)
   */
  public static searchByName(nomRaisonSociale: string) {
    return this.query().whereILike('nomRaisonSociale', `%${nomRaisonSociale}%`)
  }

  /**
   * Par centre d'impôts
   */
  public static byCentre(centre: string) {
    return this.query().whereILike('centre', `%${centre}%`)
  }

  /**
   * Par régime fiscal
   */
  public static byRegime(regime: string) {
    return this.query().whereILike('regime', `%${regime}%`)
  }

  /**
   * Contribuables vérifiés et trouvés dans la DGI
   */
  public static verifiedFound() {
    return this.query().where('status', TaxpayerStatus.VERIFIED_FOUND)
  }

  /**
   * Contribuables vérifiés (trouvés ou non)
   */
  public static verified() {
    return this.query().whereIn('status', [
      TaxpayerStatus.VERIFIED_FOUND,
      TaxpayerStatus.VERIFIED_NOT_FOUND,
    ])
  }

  /**
   * Contribuables non encore vérifiés
   */
  public static notYetChecked() {
    return this.query().where('status', TaxpayerStatus.NOT_YET_CHECKED)
  }

  /**
   * Par status
   */
  public static byStatus(status: TaxpayerStatus) {
    return this.query().where('status', status)
  }

  /**
   * Contribuables nécessitant une re-vérification DGI
   */
  public static needsCheck(daysOld: number = 30) {
    const checkDate = DateTime.now().minus({ days: daysOld }).toSQL()
    return this.query().where((query) => {
      query.whereNull('lastDgiCheck').orWhere('lastDgiCheck', '<', checkDate)
    })
  }

  /**
   * Avec NIU (pour synchronisation)
   */
  public static withNIU() {
    return this.query().whereNotNull('niu')
  }

  /**
   * Sans NIU
   */
  public static withoutNIU() {
    return this.query().whereNull('niu')
  }
}
