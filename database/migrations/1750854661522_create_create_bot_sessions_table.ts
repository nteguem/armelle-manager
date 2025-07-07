import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'bot_sessions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      // Identifiant unique
      table.uuid('id').primary().defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery)

      // Relations
      table.uuid('bot_user_id').notNullable()
      table.foreign('bot_user_id').references('bot_users.id').onDelete('CASCADE')

      // Canal de communication
      table.string('channel', 20).notNullable()
      table.string('channel_user_id', 100).notNullable()

      // Workflow actuel
      table.string('current_workflow', 50).nullable()
      table.string('current_step', 50).nullable()

      // Contexte minimal
      table.json('current_context').defaultTo('{}').notNullable()

      // Statut et métadonnées
      table.boolean('is_active').defaultTo(true).notNullable()
      table.timestamp('last_interaction_at', { useTz: true }).nullable()
      table.integer('message_count').defaultTo(0).notNullable()

      // Timestamps
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      // Index pour les performances
      table.index(['bot_user_id', 'channel', 'is_active'])
      table.index(['channel', 'channel_user_id'])
      table.index(['current_workflow', 'current_step'])
      table.index(['last_interaction_at'])

      // Contrainte unique pour éviter les doublons
      table.unique(['bot_user_id', 'channel', 'channel_user_id', 'is_active'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
