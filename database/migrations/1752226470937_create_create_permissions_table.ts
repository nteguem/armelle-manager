import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'permissions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('name', 100).notNullable().unique()
      table.string('display_name', 150).notNullable()
      table.text('description').nullable()
      table.string('module', 50).notNullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')

      // Indexes
      table.index(['name'])
      table.index(['module'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
