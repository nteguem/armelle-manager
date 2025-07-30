import MfaSession from '#models/mfa_session'
import User from '#models/user'
import { DateTime } from 'luxon'
import type { LoginResponse } from '../types/nellys_coin_types.js'

export default class AuthService {
  /**
   * Save or update user from Nellys Coin response
   */
  async saveUser(loginResponse: any): Promise<User> {
    console.log(`[AUTH_SERVICE:SAVE_USER] Starting user save process`, {
      hasToken: !!loginResponse.authToken,
      hasRefreshToken: !!loginResponse.refreshToken,
      hasUserData: !!loginResponse.data,
    })

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
        console.log(`[AUTH_SERVICE:SAVE_USER] JWT decoded`, {
          hasUser: !!decoded?.user,
          decodedKeys: decoded ? Object.keys(decoded) : [],
        })
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

    console.log(`[AUTH_SERVICE:SAVE_USER] User saved successfully`, {
      userId: user.id,
      nellysCoinId: user.nellysCoinId,
      username: user.username,
      canAccessPanel: user.canAccessPanel,
      tokenExpiresAt: user.tokenExpiresAt?.toISO(),
    })

    return user
  }

  /**
   * Create MFA session
   */
  async createMfaSession(loginResponse: LoginResponse): Promise<MfaSession> {
    console.log(`[AUTH_SERVICE:CREATE_MFA_SESSION] Creating MFA session`, {
      loginReference: loginResponse.data.loginReference,
      hasMfaData: !!loginResponse.data.mfaData,
    })

    // Ensure metadata is properly formatted as JSON
    const mfaData = loginResponse.data.mfaData || []

    // Extract the first MFA method ID if available
    const mfaId = Array.isArray(mfaData) && mfaData[0]?.id ? mfaData[0].id.toString() : null

    const session = await MfaSession.create({
      loginReference: loginResponse.data.loginReference!,
      username: '',
      mfaReference: mfaId,
      status: 'pending',
      attempts: 0,
      metadata: JSON.stringify(mfaData), // Explicitly stringify for PostgreSQL
      expiresAt: DateTime.now().plus({ minutes: 10 }), // 10 minutes expiry
    })

    console.log(`[AUTH_SERVICE:CREATE_MFA_SESSION] MFA session created`, {
      sessionId: session.id,
      loginReference: session.loginReference,
      mfaReference: session.mfaReference,
      expiresAt: session.expiresAt.toISO(),
    })

    return session
  }

  /**
   * Verify MFA session
   */
  async verifyMfaSession(loginReference: string): Promise<MfaSession | null> {
    console.log(`[AUTH_SERVICE:VERIFY_MFA_SESSION] Verifying MFA session`, {
      loginReference,
    })

    const session = await MfaSession.query()
      .where('loginReference', loginReference)
      .where('status', 'pending')
      .where('expiresAt', '>', DateTime.now().toSQL())
      .first()

    if (!session) {
      console.warn(`[AUTH_SERVICE:VERIFY_MFA_SESSION] No valid session found`)
      return null
    }

    console.log(`[AUTH_SERVICE:VERIFY_MFA_SESSION] Session found`, {
      sessionId: session.id,
      attempts: session.attempts,
      status: session.status,
      expiresAt: session.expiresAt.toISO(),
    })

    if (session.attempts >= 5) {
      console.warn(`[AUTH_SERVICE:VERIFY_MFA_SESSION] Max attempts reached, expiring session`)
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
    console.log(`[AUTH_SERVICE:INCREMENT_MFA_ATTEMPTS] Incrementing attempts`, {
      sessionId: session.id,
      currentAttempts: session.attempts,
    })

    session.attempts++
    await session.save()

    console.log(`[AUTH_SERVICE:INCREMENT_MFA_ATTEMPTS] Attempts incremented`, {
      sessionId: session.id,
      newAttempts: session.attempts,
      maxAttempts: 5,
    })
  }

  /**
   * Complete MFA session
   */
  async completeMfaSession(session: MfaSession, username: string): Promise<void> {
    console.log(`[AUTH_SERVICE:COMPLETE_MFA_SESSION] Completing MFA session`, {
      sessionId: session.id,
      loginReference: session.loginReference,
      username,
    })

    session.status = 'verified'
    session.username = username

    await session.save()

    console.log(`[AUTH_SERVICE:COMPLETE_MFA_SESSION] MFA session completed`)
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
    console.log(`[AUTH_SERVICE:INVALIDATE_TOKENS] Invalidating tokens for user`, {
      userId,
    })

    await User.query().where('id', userId).update({
      token: null,
      refreshToken: null,
      tokenExpiresAt: null,
    })

    console.log(`[AUTH_SERVICE:INVALIDATE_TOKENS] Tokens invalidated successfully`)
  }

  /**
   * Clean expired sessions
   */
  async cleanExpiredSessions(): Promise<void> {
    console.log(`[AUTH_SERVICE:CLEAN_EXPIRED_SESSIONS] Starting cleanup`)

    // Clean expired MFA sessions
    const expiredMfaSessions = await MfaSession.query()
      .where('expiresAt', '<', DateTime.now().toSQL())
      .orWhere('status', 'expired')
      .delete()

    // Clean expired tokens
    const expiredTokens = await User.query()
      .whereNotNull('tokenExpiresAt')
      .where('tokenExpiresAt', '<', DateTime.now().toSQL())
      .update({
        token: null,
        refreshToken: null,
        tokenExpiresAt: null,
      })

    console.log(`[AUTH_SERVICE:CLEAN_EXPIRED_SESSIONS] Cleanup completed`, {
      expiredMfaSessions,
      expiredTokens,
    })
  }
}
