import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected readonly tableName: string = 'taxpayers'

  public async up(): Promise<void> {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))

      // Données DGI principales
      table.string('niu', 15).notNullable().unique()
      table.string('nom_raison_sociale', 255).notNullable()
      table.string('prenom_sigle', 255).nullable()

      // Informations fiscales DGI
      table.string('numero_cni_rc', 50).nullable()
      table.string('activite', 500).nullable()
      table.string('regime_fiscal', 100).nullable()
      table.string('centre_impots', 100).nullable()
      table.string('etat', 50).nullable() // Actif/Inactif

      // Type contribuable (déduit du NIU)
      table.enum('type_contribuable', ['personne_physique', 'personne_morale']).notNullable()

      // Métadonnées
      table.boolean('is_verified').defaultTo(true).notNullable() // Vérifié via DGI
      table.text('dgi_raw_data').defaultTo('{}').notNullable() // Données brutes DGI
      table.timestamp('last_dgi_check').nullable()

      // Timestamps
      table.timestamp('created_at').defaultTo(this.now()).notNullable()
      table.timestamp('updated_at').defaultTo(this.now()).notNullable()

      // Index pour performance
      table.index(['niu'])
      table.index(['nom_raison_sociale'])
      table.index(['regime_fiscal'])
      table.index(['centre_impots'])
      table.index(['type_contribuable'])
      table.index(['etat'])
    })
  }

  public async down(): Promise<void> {
    this.schema.dropTable(this.tableName)
  }
}
