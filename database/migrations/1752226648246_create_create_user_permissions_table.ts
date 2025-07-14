import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_permissions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE')
      table
        .integer('permission_id')
        .unsigned()
        .references('id')
        .inTable('permissions')
        .onDelete('CASCADE')
      table
        .integer('granted_by')
        .unsigned()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
        .nullable()
      table.timestamp('granted_at')
      table.timestamp('expires_at').nullable()

      // Composite primary key
      table.primary(['user_id', 'permission_id'])

      // Indexes
      table.index(['user_id'])
      table.index(['permission_id'])
      table.index(['expires_at'])
      table.index(['granted_by'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
