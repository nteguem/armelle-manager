import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'role_permissions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.integer('role_id').unsigned().notNullable()
      table.integer('permission_id').unsigned().notNullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')

      // Clés étrangères
      table.foreign('role_id').references('id').inTable('roles').onDelete('CASCADE')
      table.foreign('permission_id').references('id').inTable('permissions').onDelete('CASCADE')

      // Index unique pour éviter les doublons
      table.unique(['role_id', 'permission_id'])

      // Index pour les performances
      table.index(['role_id'])
      table.index(['permission_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
