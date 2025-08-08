import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected readonly tableName: string = 'user_taxpayers'

  public async up(): Promise<void> {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))

      table.integer('user_id').notNullable()
      table.uuid('taxpayer_id').notNullable()

      table.enum('relationship_type', ['creator', 'manager']).notNullable()

      table.timestamp('assigned_at').defaultTo(this.now()).notNullable()
      table.timestamp('updated_at').defaultTo(this.now()).notNullable()

      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE')
      table.foreign('taxpayer_id').references('id').inTable('taxpayers').onDelete('CASCADE')

      table.index(['user_id', 'taxpayer_id'])
      table.index(['taxpayer_id', 'user_id'])
      table.index(['relationship_type'])

      table.unique(['user_id', 'taxpayer_id'])
    })
  }

  public async down(): Promise<void> {
    this.schema.dropTable(this.tableName)
  }
}
