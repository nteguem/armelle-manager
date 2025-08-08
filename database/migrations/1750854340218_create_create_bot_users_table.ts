import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'bot_users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))

      table.string('phone_number', 20).notNullable().unique()
      table.string('full_name', 255).nullable()
      table.enum('language', ['fr', 'en']).defaultTo('fr').notNullable()

      table.boolean('is_active').defaultTo(true).notNullable()
      table.boolean('is_verified').defaultTo(false).notNullable()

      table.string('registration_channel', 20).defaultTo('whatsapp').notNullable()
      table.json('metadata').defaultTo('{}').notNullable()

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      table.index(['phone_number'])
      table.index(['is_active', 'is_verified'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
