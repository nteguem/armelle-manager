import PasswordResetToken from '#models/password_reset_token'
import { DateTime } from 'luxon'
import stringHelpers from '@adonisjs/core/helpers/string'

export default class PasswordService {
  /**
   * Create password reset token
   */
  async createResetToken(
    verificationMode: 'email' | 'phone',
    identifier: string
  ): Promise<PasswordResetToken> {
    // Expire previous tokens
    await this.expirePreviousTokens(verificationMode, identifier)

    // Generate 6-digit code
    const code = this.generateCode()

    const token = await PasswordResetToken.create({
      email: verificationMode === 'email' ? identifier : null,
      phone: verificationMode === 'phone' ? identifier : null,
      code,
      verificationMode,
      isUsed: false,
      attempts: 0,
      expiresAt: DateTime.now().plus({ minutes: 15 }), // 15 minutes expiry
    })

    return token
  }

  /**
   * Verify reset token
   */
  async verifyResetToken(
    code: string,
    verificationMode: 'email' | 'phone',
    identifier: string
  ): Promise<PasswordResetToken | null> {
    const query = PasswordResetToken.query()
      .where('code', code)
      .where('verificationMode', verificationMode)
      .where('isUsed', false)
      .where('expiresAt', '>', DateTime.now().toSQL())

    if (verificationMode === 'email') {
      query.where('email', identifier)
    } else {
      query.where('phone', identifier)
    }

    const token = await query.first()

    if (!token) {
      return null
    }

    // Check attempts
    if (token.attempts >= 3) {
      token.isUsed = true
      await token.save()
      return null
    }

    return token
  }

  /**
   * Increment token attempts
   */
  async incrementAttempts(token: PasswordResetToken): Promise<void> {
    token.attempts++
    await token.save()
  }

  /**
   * Mark token as used
   */
  async markTokenAsUsed(token: PasswordResetToken): Promise<void> {
    token.isUsed = true
    await token.save()
  }

  /**
   * Expire previous tokens
   */
  private async expirePreviousTokens(
    verificationMode: 'email' | 'phone',
    identifier: string
  ): Promise<void> {
    const query = PasswordResetToken.query()
      .where('verificationMode', verificationMode)
      .where('isUsed', false)

    if (verificationMode === 'email') {
      query.where('email', identifier)
    } else {
      query.where('phone', identifier)
    }

    await query.update({ isUsed: true })
  }

  /**
   * Generate 6-digit code
   */
  private generateCode(): string {
    // Generate random 6-digit number
    return Math.floor(100000 + Math.random() * 900000).toString()
  }

  /**
   * Clean expired tokens
   */
  async cleanExpiredTokens(): Promise<void> {
    await PasswordResetToken.query()
      .where('expiresAt', '<', DateTime.now().toSQL())
      .orWhere('isUsed', true)
      .delete()
  }
}
