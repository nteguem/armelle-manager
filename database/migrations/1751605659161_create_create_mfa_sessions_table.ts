import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'mfa_sessions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('login_reference').notNullable().unique()
      table.string('mfa_reference').nullable()
      table.string('username').notNullable()
      table.enum('status', ['pending', 'verified', 'expired']).defaultTo('pending')
      table.integer('attempts').defaultTo(0)
      table.json('metadata').nullable()
      table.timestamp('expires_at').notNullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')

      // Indexes
      table.index(['login_reference'])
      table.index(['status'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
