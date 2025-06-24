import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'permissions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.string('name', 100).notNullable().unique() // Ex: "users.read", "users.write"
      table.string('description', 255).notNullable() // Description lisible
      table.string('module', 50).notNullable() // Ex: "users", "roles", "content"
      table.string('category', 50).notNullable() // Ex: "read", "write", "delete"
      table.timestamp('created_at')
      table.timestamp('updated_at')

      // Index pour optimiser les recherches par module
      table.index(['module'])
      table.index(['category'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
