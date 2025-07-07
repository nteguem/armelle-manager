import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('nellys_coin_id').notNullable().unique()
      table.string('username').nullable()
      table.string('email').nullable()
      table.boolean('can_access_panel').defaultTo(false)
      table.text('token').nullable()
      table.text('refresh_token').nullable()
      table.timestamp('token_expires_at').nullable()
      table.json('metadata').nullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')

      // Indexes
      table.index(['email'])
      table.index(['username'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
