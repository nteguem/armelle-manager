import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Role from '#models/role'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password',
})

export default class User extends compose(BaseModel, AuthFinder) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare email: string

  @column()
  declare firstName: string

  @column()
  declare lastName: string

  @column({ serializeAs: null })
  declare password: string

  @column()
  declare status: 'pending' | 'active' | 'inactive' | 'suspended' | 'deleted'

  @column()
  declare roleId: number | null

  @column.dateTime()
  declare lastLogin: DateTime | null

  @column()
  declare loginCount: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => Role)
  declare role: BelongsTo<typeof Role>

  static accessTokens = DbAccessTokensProvider.forModel(User)

  // Méthode simplifiée pour vérifier les permissions
  public async hasPermission(permission: string): Promise<boolean> {
    // Charge le rôle avec ses permissions depuis la base
    const userWithRole = await User.query()
      .where('id', this.id)
      .preload('role', (roleQuery) => {
        roleQuery.preload('permissions')
      })
      .first()

    if (!userWithRole?.role) return false
    return userWithRole.role.permissions.some((perm) => perm.name === permission)
  }

  public get fullName(): string {
    return `${this.firstName} ${this.lastName}`
  }
}
