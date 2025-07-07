import User from '#models/user'
import MfaSession from '#models/mfa_session'
import { DateTime } from 'luxon'
import type { NellysCoinUser, LoginResponse } from '../types/nellys_coin_types.js'

export default class AuthService {
  /**
   * Save or update user from Nellys Coin response
   */
  async saveUser(loginResponse: any): Promise<User> {
    // Handle both MFA and direct login responses
    const token = loginResponse.token || loginResponse.access_token
    const refreshToken = loginResponse.refreshToken || loginResponse.refresh_token

    // Extract user data from response or decode from JWT
    let userData: any = {}
    let userId: string | number | undefined

    if (loginResponse.data) {
      userData = loginResponse.data
      userId = userData.id || userData.userId || userData.user?.id
    } else if (loginResponse.user) {
      userData = loginResponse.user
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
        console.error('Failed to decode JWT:', error)
      }
    }

    if (!userId) {
      throw new Error('Unable to extract user ID from response')
    }

    // Extract user details
    const username = userData.username || userData.user?.username
    const email =
      userData.email ||
      userData.user?.email ||
      userData.emailAddress ||
      userData.details?.emailAddress
    const canAccessPanel =
      userData.customerType?.description === 'admin' || userData.canAccessPanel || false

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

    return user
  }

  /**
   * Create MFA session
   */
  async createMfaSession(loginResponse: LoginResponse, username: string): Promise<MfaSession> {
    // Ensure metadata is properly formatted as JSON
    const mfaData = loginResponse.data.mfaData || []

    // Extract the first MFA method ID if available
    const mfaId = Array.isArray(mfaData) && mfaData[0]?.id ? mfaData[0].id.toString() : null

    const session = await MfaSession.create({
      loginReference: loginResponse.data.loginReference!,
      mfaReference: mfaId,
      username,
      status: 'pending',
      attempts: 0,
      metadata: JSON.stringify(mfaData), // Explicitly stringify for PostgreSQL
      expiresAt: DateTime.now().plus({ minutes: 10 }), // 10 minutes expiry
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

    if (session && session.attempts >= 5) {
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
  async completeMfaSession(session: MfaSession): Promise<void> {
    session.status = 'verified'
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
