import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'igs_calculations'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()
      table
        .uuid('bot_user_id')
        .notNullable()
        .references('id')
        .inTable('bot_users')
        .onDelete('CASCADE')

      // Données du workflow
      table.string('sector').notNullable() // formal/informal
      table.string('subcategory').notNullable() // sous-catégorie selon le secteur

      // Années de référence (calculées automatiquement)
      table.integer('previous_year').notNullable() // ex: 2024
      table.integer('current_year').notNullable() // ex: 2025

      // Montants saisis par l'utilisateur
      table.bigInteger('previous_year_revenue').notNullable() // CA de previous_year
      table.bigInteger('current_year_estimate').notNullable() // Estimation CA de current_year
      table.string('company_type').notNullable() // legal_entity/individual
      table.string('company_name').notNullable()
      table.string('phone_number').notNullable()
      table.string('city').notNullable()
      table.string('neighborhood').nullable()
      table.string('niu').notNullable()

      // Résultat du calcul
      table.bigInteger('calculated_igs').notNullable()

      // Métadonnées
      table.string('calculation_version').defaultTo('1.0.0') // pour tracer les versions de calcul
      table.json('raw_workflow_data').nullable() // backup des données brutes du workflow

      table.timestamps(true)

      // Index pour optimiser les requêtes
      table.index(['bot_user_id'])
      table.index(['created_at'])
      table.index(['bot_user_id', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
