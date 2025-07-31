import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected readonly tableName: string = 'taxpayers'

  public async up(): Promise<void> {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))

      // Données DGI principales
      table.string('niu', 15).nullable() // Nullable pour permettre création sans NIU
      table.string('nom_raison_sociale', 255).notNullable()
      table.string('prenom_sigle', 255).nullable()

      // Informations fiscales DGI (noms simplifiés)
      table.string('numero_cni_rc', 50).nullable()
      table.string('activite', 500).nullable()
      table.string('regime', 100).nullable()
      table.string('centre', 100).nullable()
      table.string('etat', 50).nullable() // Actif/Inactif

      // Type contribuable (déduit du NIU)
      table.enum('type_contribuable', ['personne_physique', 'personne_morale']).notNullable()

      // Nouveau système de status
      table
        .enum('status', ['not_yet_checked', 'verified_found', 'verified_not_found'])
        .defaultTo('not_yet_checked')
        .notNullable()

      // Nouveaux champs
      table.string('phone_number', 20).nullable()
      table.date('date_naissance').nullable()

      // Métadonnées
      table.json('dgi_raw_data').defaultTo('{}').notNullable() // Données brutes DGI
      table.timestamp('last_dgi_check').nullable()

      // Timestamps
      table.timestamp('created_at').defaultTo(this.now()).notNullable()
      table.timestamp('updated_at').defaultTo(this.now()).notNullable()

      // Index pour performance
      table.index(['nom_raison_sociale'])
      table.index(['regime'])
      table.index(['centre'])
      table.index(['type_contribuable'])
      table.index(['etat'])
      table.index(['status'])
      table.index(['phone_number'])
      table.index(['date_naissance'])
    })

    // Contrainte unique sur NIU seulement quand il n'est pas NULL
    this.schema.raw(`
      CREATE UNIQUE INDEX taxpayers_niu_unique 
      ON taxpayers (niu) 
      WHERE niu IS NOT NULL
    `)
  }

  public async down(): Promise<void> {
    this.schema.dropTable(this.tableName)
  }
}
