import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'role_permissions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.integer('role_id').unsigned().references('id').inTable('roles').onDelete('CASCADE')
      table
        .integer('permission_id')
        .unsigned()
        .references('id')
        .inTable('permissions')
        .onDelete('CASCADE')
      table.timestamp('created_at')
      table.timestamp('updated_at')

      // Composite primary key
      table.primary(['role_id', 'permission_id'])

      // Indexes
      table.index(['role_id'])
      table.index(['permission_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
