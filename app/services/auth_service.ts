import MfaSession from '#models/rest-api/mfa_session'
import User from '#models/rest-api/user'
import Role from '#models/rest-api/role'
import { DateTime } from 'luxon'
import type { LoginResponse } from '../types/nellys_coin_types.js'

export default class AuthService {
  /**
   * Save or update user from Nellys Coin response
   */
  async saveUser(loginResponse: any): Promise<User> {
    let token: string | undefined
    let refreshToken: string | undefined
    let userData: any = {}
    let userId: string | number | undefined

    if (loginResponse.data) {
      token = loginResponse.data.authToken
      refreshToken = loginResponse.data.refreshToken

      userData = loginResponse.data.customerData
      userId = userData.id
    }

    // If no user data in response, try to decode from token
    if (!userId && token) {
      try {
        const jwt = await import('jsonwebtoken')
        const decoded = jwt.default.decode(token) as any
        if (decoded?.user) {
          userData = decoded.user
          userId = decoded.user.id || decoded.user.userId
        }
      } catch (error) {
        console.error(`[AUTH_SERVICE:SAVE_USER] Failed to decode JWT:`, error)
      }
    }

    if (!userId) {
      console.error(`[AUTH_SERVICE:SAVE_USER] Unable to extract user ID from response`)
      throw new Error('Unable to extract user ID from response')
    }

    // Extract user details
    const username = userData.username
    const email = userData.emailAddress
    const canAccessPanel = userData.customerType?.description === 'admin' || false

    // Check if user already exists
    const existingUser = await User.findBy('nellys_coin_id', String(userId))
    const isNewUser = !existingUser

    const user = await User.updateOrCreate(
      { nellysCoinId: String(userId) },
      {
        username,
        email,
        canAccessPanel,
        token,
        refreshToken,
        tokenExpiresAt:
          loginResponse.expires_in || loginResponse.expiresIn
            ? DateTime.now().plus({
                seconds: Number.parseInt(loginResponse.expires_in || '3600'),
              })
            : DateTime.now().plus({ hours: 1 }),
        metadata: JSON.stringify(userData),
      }
    )

    // Assign default role if it's a new user
    if (isNewUser) {
      try {
        const defaultRole = await Role.findBy('name', 'user')
        if (defaultRole) {
          await user.related('roles').attach([defaultRole.id])
          console.log(`[AUTH_SERVICE] Assigned default role 'user' to new user: ${user.username}`)
        } else {
          console.warn(`[AUTH_SERVICE] Default role 'user' not found`)
        }
      } catch (error) {
        console.error(`[AUTH_SERVICE] Failed to assign default role:`, error)
      }
    }

    return user
  }

  /**
   * Create MFA session
   */
  async createMfaSession(loginResponse: LoginResponse): Promise<MfaSession> {
    const mfaData = loginResponse.data.mfaData

    // Correction: mfaData est un objet unique, pas un tableau
    const mfaId = mfaData?.id ? mfaData.id.toString() : null

    const session = await MfaSession.create({
      loginReference: loginResponse.data.loginReference!,
      username: '',
      mfaReference: mfaId,
      status: 'pending',
      attempts: 0,
      metadata: JSON.stringify(mfaData),
      expiresAt: DateTime.now().plus({ minutes: 10 }),
    })

    return session
  }

  /**
   * Verify MFA session
   */
  async verifyMfaSession(loginReference: string): Promise<MfaSession | null> {
    const session = await MfaSession.query()
      .where('loginReference', loginReference)
      .where('status', 'pending')
      .where('expiresAt', '>', DateTime.now().toSQL())
      .first()

    if (!session) {
      return null
    }

    if (session.attempts >= 5) {
      session.status = 'expired'
      await session.save()
      return null
    }

    return session
  }

  /**
   * Increment MFA attempts
   */
  async incrementMfaAttempts(session: MfaSession): Promise<void> {
    session.attempts++
    await session.save()
  }

  /**
   * Complete MFA session
   */
  async completeMfaSession(session: MfaSession, username: string): Promise<void> {
    session.status = 'verified'
    session.username = username

    await session.save()
  }

  /**
   * Get user by token
   */
  async getUserByToken(token: string): Promise<User | null> {
    return User.query()
      .where('token', token)
      .where('tokenExpiresAt', '>', DateTime.now().toSQL())
      .first()
  }

  /**
   * Invalidate user tokens
   */
  async invalidateTokens(userId: number): Promise<void> {
    await User.query().where('id', userId).update({
      token: null,
      refreshToken: null,
      tokenExpiresAt: null,
    })
  }

  /**
   * Clean expired sessions
   */
  async cleanExpiredSessions(): Promise<void> {
    // Clean expired MFA sessions
    await MfaSession.query()
      .where('expiresAt', '<', DateTime.now().toSQL())
      .orWhere('status', 'expired')
      .delete()

    // Clean expired tokens
    await User.query()
      .whereNotNull('tokenExpiresAt')
      .where('tokenExpiresAt', '<', DateTime.now().toSQL())
      .update({
        token: null,
        refreshToken: null,
        tokenExpiresAt: null,
      })
  }
}
