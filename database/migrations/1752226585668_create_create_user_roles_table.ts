import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_roles'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE')
      table.integer('role_id').unsigned().references('id').inTable('roles').onDelete('CASCADE')
      table
        .integer('assigned_by')
        .unsigned()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
        .nullable()
      table.timestamp('assigned_at')
      table.timestamp('expires_at').nullable()

      // Composite primary key
      table.primary(['user_id', 'role_id'])

      // Indexes
      table.index(['user_id'])
      table.index(['role_id'])
      table.index(['expires_at'])
      table.index(['assigned_by'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
