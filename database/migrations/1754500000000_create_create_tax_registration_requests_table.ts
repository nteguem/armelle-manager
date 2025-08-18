import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'tax_registration_requests'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      table
        .enum('contributor_type', [
          'individual_non_professional',
          'individual_professional',
          'legal_entity',
        ])
        .notNullable()
      table.text('registration_data').notNullable()
      table
        .enum('status', ['awaiting_payment', 'ready_for_review', 'processed', 'rejected'])
        .defaultTo('awaiting_payment')

      table.string('generated_niu').nullable()
      table.string('generated_password').nullable()
      table.string('document_path').nullable()
      table.enum('source', ['whatsapp_bot', 'admin_dashboard']).notNullable()

      table.integer('created_by_user_id').unsigned().nullable()
      table.uuid('created_by_bot_user_id').nullable()
      table.integer('processed_by_user_id').unsigned().nullable()
      table.text('rejection_reason').nullable()

      table.timestamp('processed_at').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.foreign('created_by_user_id').references('id').inTable('users').onDelete('SET NULL')
      table
        .foreign('created_by_bot_user_id')
        .references('id')
        .inTable('bot_users')
        .onDelete('SET NULL')
      table.foreign('processed_by_user_id').references('id').inTable('users').onDelete('SET NULL')

      table.index('status')
      table.index('contributor_type')
      table.index('source')
      table.index('created_by_bot_user_id')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
