import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected readonly tableName: string = 'bot_users'

  public async up(): Promise<void> {
    this.schema.alterTable(this.tableName, (table) => {
      // Relation vers taxpayer
      table
        .uuid('taxpayer_id')
        .nullable()
        .references('id')
        .inTable('taxpayers')
        .onDelete('SET NULL')

      // Index
      table.index(['taxpayer_id'])
    })
  }

  public async down(): Promise<void> {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('taxpayer_id')
    })
  }
}
