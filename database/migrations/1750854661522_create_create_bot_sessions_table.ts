import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected readonly tableName: string = 'bot_sessions'

  public async up(): Promise<void> {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))

      // Relations
      table
        .uuid('bot_user_id')
        .notNullable()
        .references('id')
        .inTable('bot_users')
        .onDelete('CASCADE')

      // Identifiants canal
      table.string('channel', 20).notNullable() // 'whatsapp', 'telegram', 'discord'
      table.string('channel_user_id', 100).notNullable() // phone, telegram_id, discord_id

      // État workflow complexe
      table.string('current_workflow', 50).nullable() // 'onboarding', 'igs_calculator' etc.
      table.string('current_step', 50).nullable() // 'collect_name', 'calculate'
      table.json('current_context').defaultTo('{}').notNullable() // données workflow temporaires
      table.json('persistent_context').defaultTo('{}').notNullable() // données cross-workflow
      table.json('navigation_stack').defaultTo('[]').notNullable() // pile navigation complète
      table.json('workflow_history').defaultTo('{}').notNullable() // historique workflows
      table.json('active_workflows').defaultTo('[]').notNullable() // workflows en parallèle

      // Statut session
      table.boolean('is_active').defaultTo(true).notNullable()
      table.timestamp('last_activity_at').defaultTo(this.now()).notNullable()
      table.timestamp('last_interaction_at').nullable()
      table.timestamp('expires_at').nullable()

      // Métadonnées
      table.integer('message_count').defaultTo(0).notNullable()

      // Timestamps
      table.timestamp('created_at').defaultTo(this.now()).notNullable()
      table.timestamp('updated_at').defaultTo(this.now()).notNullable()

      // Contraintes et index
      table.unique(['channel', 'channel_user_id'])
      table.index(['bot_user_id'])
      table.index(['is_active'])
      table.index(['last_activity_at'])
      table.index(['last_interaction_at'])
      table.index(['current_workflow'])
    })
  }

  public async down(): Promise<void> {
    this.schema.dropTable(this.tableName)
  }
}
