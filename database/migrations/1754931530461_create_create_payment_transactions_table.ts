import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected readonly tableName: string = 'payment_transactions'

  public async up(): Promise<void> {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()

      table
        .integer('tax_registration_request_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('tax_registration_requests')
        .onDelete('CASCADE')

      table.decimal('amount', 12, 2).notNullable()
      table.decimal('fees_amount', 12, 2).nullable()
      table.decimal('total_amount', 12, 2).nullable()

      table.string('phone_number', 20).notNullable()
      table.enum('payment_mode', ['MOMO', 'OM']).notNullable()
      table
        .enum('status', ['pending', 'initiated', 'confirmed', 'rejected', 'failed'])
        .notNullable()
        .defaultTo('pending')

      table.string('internal_payment_id', 100).nullable().unique()
      table.string('external_reference', 100).notNullable().unique()

      table.json('provider_response').defaultTo('{}').notNullable()

      table.timestamp('confirmed_at').nullable()
      table.timestamp('created_at').defaultTo(this.now()).notNullable()
      table.timestamp('updated_at').defaultTo(this.now()).notNullable()

      table.index(['tax_registration_request_id'])
      table.index(['status'])
      table.index(['payment_mode'])
      table.index(['phone_number'])
      table.index(['external_reference'])
      table.index(['internal_payment_id'])
      table.index(['confirmed_at'])
      table.index(['created_at'])
    })
  }

  public async down(): Promise<void> {
    this.schema.dropTable(this.tableName)
  }
}
