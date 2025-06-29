import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'bot_users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      // Identifiant unique UUID
      table.uuid('id').primary().defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery)

      // Numéro de téléphone unique (identifiant principal)
      table.string('phone_number', 20).notNullable().unique()

      // Nom complet de l'utilisateur
      table.string('full_name', 255).nullable()

      // Langue préférée
      table.enum('language', ['fr', 'en']).defaultTo('fr').notNullable()

      // Statuts
      table.boolean('is_active').defaultTo(true).notNullable()
      table.boolean('is_verified').defaultTo(false).notNullable()

      // Lien avec un contribuable (optionnel)
      table.uuid('taxpayer_id').nullable()

      // Canal d'inscription initial
      table.string('registration_channel', 20).defaultTo('whatsapp').notNullable()

      // Métadonnées additionnelles
      table.json('metadata').defaultTo('{}').notNullable()

      // Timestamps
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      // Index pour les performances
      table.index(['phone_number'])
      table.index(['is_active', 'is_verified'])
      table.index(['taxpayer_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
