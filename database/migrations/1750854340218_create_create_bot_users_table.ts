import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected readonly tableName: string = 'bot_users'

  public async up(): Promise<void> {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))

      // Identifiants utilisateur
      table.string('phone_number', 20).notNullable().unique()
      table.string('full_name', 255).notNullable()
      table.string('language', 2).defaultTo('fr').notNullable()

      // Statut et préférences
      table.boolean('is_active').defaultTo(true).notNullable()
      table.boolean('is_verified').defaultTo(false).notNullable()
      table.json('preferences').defaultTo('{}').notNullable()

      // Métadonnées
      table.timestamp('last_interaction_at').nullable()
      table.integer('total_messages').defaultTo(0).notNullable()
      table.string('registration_channel', 20).defaultTo('whatsapp').notNullable()

      // Timestamps
      table.timestamp('created_at').defaultTo(this.now()).notNullable()
      table.timestamp('updated_at').defaultTo(this.now()).notNullable()

      // Index pour performance
      table.index(['phone_number'])
      table.index(['is_active'])
      table.index(['language'])
      table.index(['last_interaction_at'])
    })
  }

  public async down(): Promise<void> {
    this.schema.dropTable(this.tableName)
  }
}
