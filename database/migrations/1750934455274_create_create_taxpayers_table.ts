import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected readonly tableName: string = 'taxpayers'

  public async up(): Promise<void> {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))

      table.string('niu', 15).nullable()
      table.string('nom_raison_sociale', 255).notNullable()
      table.string('prenom_sigle', 255).nullable()

      table.string('numero_cni_rc', 50).nullable()
      table.string('activite', 500).nullable()
      table.string('regime', 100).nullable()
      table.string('centre', 100).nullable()
      table.string('etat', 50).nullable()

      table.enum('type_contribuable', ['personne_physique', 'personne_morale']).notNullable()

      table.string('created_by_id').notNullable()
      table.enum('created_by_type', ['bot_user', 'admin']).notNullable()
      table.enum('source', ['imported', 'platform_created']).notNullable()

      table.string('phone_number', 20).nullable()
      table.date('date_naissance').nullable()

      table.json('dgi_raw_data').defaultTo('{}').notNullable()
      table.timestamp('last_dgi_check').nullable()

      table.timestamp('created_at').defaultTo(this.now()).notNullable()
      table.timestamp('updated_at').defaultTo(this.now()).notNullable()

      table.index(['nom_raison_sociale'])
      table.index(['regime'])
      table.index(['centre'])
      table.index(['type_contribuable'])
      table.index(['etat'])
      table.index(['phone_number'])
      table.index(['date_naissance'])
      table.index(['created_by_id'])
      table.index(['created_by_type'])
      table.index(['source'])
      table.index(['created_by_id', 'created_by_type'])
    })

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
