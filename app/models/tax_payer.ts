import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import BotUser from './bot_user.js'

export type TypeContribuable = 'personne_physique' | 'personne_morale'

export default class Taxpayer extends BaseModel {
  static table = 'taxpayers'

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare niu: string

  @column()
  declare nomRaisonSociale: string

  @column()
  declare prenomSigle: string | null

  @column()
  declare regime: string | null

  @column()
  declare numeroCniRc: string | null

  @column()
  declare activite: string | null

  @column()
  declare regimeFiscal: string | null

  @column()
  declare centreImpots: string | null

  @column()
  declare etat: string | null

  @column()
  declare typeContribuable: TypeContribuable

  @column()
  declare isVerified: boolean

  @column({
    prepare: (value: Record<string, any>) => JSON.stringify(value),
    consume: (value: string) => JSON.parse(value),
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
   * Récupère le nomRaisonSociale complet formaté
   */
  public getNomComplet(): string {
    if (this.isPersonnePhysique() && this.prenomSigle) {
      return `${this.prenomSigle} ${this.nomRaisonSociale}`
    }
    return this.nomRaisonSociale
  }

  /**
   * Récupère le nomRaisonSociale d'affichage selon le type
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
   * Crée un contribuable à partir des données DGI
   */
  public static async createFromDGI(dgiData: {
    niu: string
    nomRaisonSociale: string
    prenomSigle?: string
    numeroCniRc?: string
    activite?: string
    regime?: string
    centre?: string
    etat?: string
  }): Promise<Taxpayer> {
    const typeContribuable = this.getTypeFromNIU(dgiData.niu)

    return await this.create({
      niu: dgiData.niu,
      nomRaisonSociale: dgiData.nomRaisonSociale,
      prenomSigle: dgiData.prenomSigle || null,
      numeroCniRc: dgiData.numeroCniRc || null,
      activite: dgiData.activite || null,
      regimeFiscal: dgiData.regime || null,
      centreImpots: dgiData.centre || null,
      etat: dgiData.etat || null,
      typeContribuable,
      isVerified: true,
      dgiRawData: dgiData,
      lastDgiCheck: DateTime.now(),
    })
  }

  /**
   * Met à jour avec de nouvelles données DGI
   */
  public async updateFromDGI(dgiData: {
    nomRaisonSociale: string
    prenomSigle?: string
    numeroCniRc?: string
    activite?: string
    regime?: string
    centre?: string
    etat?: string
  }): Promise<void> {
    this.nomRaisonSociale = dgiData.nomRaisonSociale
    this.prenomSigle = dgiData.prenomSigle || null
    this.numeroCniRc = dgiData.numeroCniRc || null
    this.activite = dgiData.activite || null
    this.regimeFiscal = dgiData.regime || null
    this.centreImpots = dgiData.centre || null
    this.etat = dgiData.etat || null
    this.dgiRawData = { ...this.dgiRawData, ...dgiData }
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
  }> {
    const utilisateursCount = await BotUser.query()
      .where('taxpayer_id', this.id)
      .count('* as total')

    const nombreUtilisateurs = Number(utilisateursCount[0]?.$extras?.total || 0)

    return {
      nombreUtilisateurs,
      derniereDGICheck: this.lastDgiCheck?.toFormat('dd/MM/yyyy HH:mm') || null,
      typeAffichage: this.isPersonnePhysique() ? 'Personne Physique' : 'Personne Morale',
      statut: this.isActif() ? 'Actif' : 'Inactif',
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
   * Recherche par nomRaisonSociale (insensible à la casse)
   */
  public static searchByName(nomRaisonSociale: string) {
    return this.query().whereILike('nomRaisonSociale', `%${nomRaisonSociale}%`)
  }

  /**
   * Par centre d'impôts
   */
  public static byCentre(centre: string) {
    return this.query().whereILike('centreImpots', `%${centre}%`)
  }

  /**
   * Par régime fiscal
   */
  public static byRegime(regime: string) {
    return this.query().whereILike('regimeFiscal', `%${regime}%`)
  }

  /**
   * Contribuables vérifiés DGI
   */
  public static verified() {
    return this.query().where('isVerified', true)
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
}
