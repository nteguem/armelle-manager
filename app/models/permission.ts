import { DateTime } from 'luxon'
import { BaseModel, column, manyToMany } from '@adonisjs/lucid/orm'
import type { ManyToMany } from '@adonisjs/lucid/types/relations'
import Role from '#models/role'

export default class Permission extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare description: string

  @column()
  declare module: string

  @column()
  declare category: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @manyToMany(() => Role, {
    pivotTable: 'role_permissions',
  })
  declare roles: ManyToMany<typeof Role>

  // Méthodes utiles s
  public static async getByModule(module: string): Promise<Permission[]> {
    return await this.query().where('module', module)
  }

  public static async getByCategory(category: string): Promise<Permission[]> {
    return await this.query().where('category', category)
  }

  public static async getGroupedByModule(): Promise<Record<string, Permission[]>> {
    const permissions = await this.all()
    const grouped: Record<string, Permission[]> = {}

    permissions.forEach((permission) => {
      if (!grouped[permission.module]) {
        grouped[permission.module] = []
      }
      grouped[permission.module].push(permission)
    })

    return grouped
  }

  public static async getGroupedByCategory(): Promise<Record<string, Permission[]>> {
    const permissions = await this.all()
    const grouped: Record<string, Permission[]> = {}

    permissions.forEach((permission) => {
      if (!grouped[permission.category]) {
        grouped[permission.category] = []
      }
      grouped[permission.category].push(permission)
    })

    return grouped
  }
}
