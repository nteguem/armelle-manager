import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'bot_messages'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      // Identifiant unique UUID
      table.uuid('id').primary().defaultTo(this.db.rawQuery('gen_random_uuid()').knexQuery)

      // Relations
      table.uuid('session_id').notNullable()
      table.foreign('session_id').references('bot_sessions.id').onDelete('CASCADE')

      table.uuid('bot_user_id').notNullable()
      table.foreign('bot_user_id').references('bot_users.id').onDelete('CASCADE')

      // Direction et type
      table.enum('direction', ['in', 'out']).notNullable() // in = utilisateur, out = bot
      table.string('message_type', 20).notNullable() // text, menu, image, document, audio

      // Contenu
      table.text('content').notNullable() // Contenu textuel du message
      table.json('structured_content').defaultTo('{}').notNullable() // Données structurées (menu, boutons, etc.)

      // Langue du message
      table.enum('language', ['fr', 'en']).notNullable()

      // Données brutes du canal
      table.json('raw_data').defaultTo('{}').notNullable() // Données originales du canal

      // Contexte workflow
      table.string('workflow_id', 50).nullable() // Workflow actif lors du message
      table.string('step_id', 50).nullable() // Étape du workflow
      table.json('context_snapshot').defaultTo('{}').notNullable() // Snapshot du contexte au moment du message

      // Traitement
      table.boolean('is_processed').defaultTo(false).notNullable()
      table.integer('processing_duration_ms').nullable() // Temps de traitement en ms
      table.string('processing_error').nullable() // Erreur éventuelle

      // Commande système détectée
      table.string('system_command').nullable() // menu, help, *, fr, en, etc.
      table.boolean('command_allowed').nullable() // Si la commande était autorisée dans le contexte

      // Validation
      table.string('validation_type').nullable() // Type de validation appliquée
      table.boolean('validation_passed').nullable()
      table.string('validation_error').nullable()

      // Métadonnées
      table.json('metadata').defaultTo('{}').notNullable()

      // Timestamp unique
      table.timestamp('created_at', { useTz: true }).notNullable()

      // Index pour les performances
      table.index(['session_id', 'created_at'])
      table.index(['bot_user_id', 'created_at'])
      table.index(['direction', 'created_at'])
      table.index(['workflow_id', 'step_id'])
      table.index(['is_processed'])
      table.index(['system_command'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
