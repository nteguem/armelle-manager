import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'auth_access_tokens'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.integer('tokenable_id').unsigned().notNullable()
      table.string('type').notNullable()
      table.string('name').nullable()
      table.string('hash').notNullable().unique()
      table.text('abilities').notNullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')
      table.timestamp('last_used_at').nullable()
      table.timestamp('expires_at').nullable()

      // Clé étrangère vers users
      table.foreign('tokenable_id').references('id').inTable('users').onDelete('CASCADE')

      // Index pour les performances
      table.index(['tokenable_id'])
      table.index(['hash'])
      table.index(['type'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
