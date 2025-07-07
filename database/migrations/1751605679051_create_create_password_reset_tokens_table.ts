import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'password_reset_tokens'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('email').nullable()
      table.string('phone').nullable()
      table.string('code').notNullable()
      table.enum('verification_mode', ['email', 'phone']).notNullable()
      table.boolean('is_used').defaultTo(false)
      table.integer('attempts').defaultTo(0)
      table.timestamp('expires_at').notNullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')

      // Indexes
      table.index(['code'])
      table.index(['email'])
      table.index(['phone'])
      table.index(['is_used'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
