import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.string('email', 255).notNullable().unique()
      table.string('first_name', 50).notNullable()
      table.string('last_name', 50).notNullable()
      table.string('password').notNullable()
      table
        .enum('status', ['pending', 'active', 'inactive', 'suspended', 'deleted'])
        .defaultTo('pending')
      table.integer('role_id').unsigned().nullable()
      table.timestamp('last_login').nullable()
      table.integer('login_count').defaultTo(0)
      table.timestamp('created_at')
      table.timestamp('updated_at')

      // Clé étrangère vers roles
      table.foreign('role_id').references('id').inTable('roles').onDelete('SET NULL')

      // Index pour les performances
      table.index(['email'])
      table.index(['status'])
      table.index(['role_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
