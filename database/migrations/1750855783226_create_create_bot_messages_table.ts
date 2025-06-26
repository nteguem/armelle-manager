import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected readonly tableName: string = 'bot_messages'

  public async up(): Promise<void> {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))

      // Relations
      table
        .uuid('session_id')
        .notNullable()
        .references('id')
        .inTable('bot_sessions')
        .onDelete('CASCADE')
      table
        .uuid('bot_user_id')
        .notNullable()
        .references('id')
        .inTable('bot_users')
        .onDelete('CASCADE')

      // Direction et type
      table.enum('direction', ['in', 'out']).notNullable()
      table.string('message_type', 30).defaultTo('text').notNullable() // 'text', 'command', 'media', 'location'

      // Contenu message
      table.text('content').notNullable()
      table.json('structured_content').defaultTo('{}').notNullable() // menus, boutons, médias
      table.string('language', 2).notNullable() // langue du message

      // Données canal brutes
      table.json('raw_data').defaultTo('{}').notNullable() // données complètes du canal
      table.string('channel_message_id', 100).nullable() // ID unique canal (pour édition)

      // Contexte workflow
      table.string('workflow_id', 50).nullable() // workflow au moment du message
      table.string('step_id', 50).nullable() // étape au moment du message
      table.json('context_snapshot').defaultTo('{}').notNullable() // contexte au moment du message

      // Traitement
      table.boolean('is_processed').defaultTo(false).notNullable()
      table.timestamp('processed_at').nullable()
      table.string('processing_error', 500).nullable()
      table.integer('processing_duration_ms').nullable() // temps traitement

      // Métadonnées
      table.boolean('is_system_message').defaultTo(false).notNullable() // message système vs utilisateur

      // Timestamps
      table.timestamp('created_at').defaultTo(this.now()).notNullable()

      // Index pour performance et analytics
      table.index(['session_id', 'created_at'])
      table.index(['bot_user_id', 'created_at'])
      table.index(['direction'])
      table.index(['workflow_id', 'step_id'])
      table.index(['is_processed'])
      table.index(['message_type'])
      table.index(['language'])
    })
  }

  public async down(): Promise<void> {
    this.schema.dropTable(this.tableName)
  }
}
