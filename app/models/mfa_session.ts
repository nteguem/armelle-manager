import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class MfaSession extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare loginReference: string

  @column()
  declare mfaReference: string | null

  @column()
  declare username: string

  @column()
  declare status: 'pending' | 'verified' | 'expired'

  @column()
  declare attempts: number

  @column({
    prepare: (value: any) => JSON.stringify(value),
    consume: (value: any) => {
      try {
        return typeof value === 'string' ? JSON.parse(value) : value
      } catch {
        return value
      }
    },
  })
  declare metadata: any

  @column.dateTime()
  declare expiresAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
