import type { HttpContext } from '@adonisjs/core/http'
import NellysCoinService from '#services/nellys_coin_service'
import PasswordService from '#services/password_service'
import AuthService from '#services/auth_service'
import PasswordResetToken from '#models/rest-api/password_reset_token'
import BaseController from '#controllers/base_controller'
import { ErrorCodes } from '#services/response_formatter'
import {
  passwordResetInitiateValidator,
  passwordResetVerifyValidator,
  passwordResetCompleteValidator,
} from '#validators/password_reset_validator'
import { inject } from '@adonisjs/core'

@inject()
export default class PasswordResetController extends BaseController {
  constructor(
    private nellysCoinService: NellysCoinService,
    private passwordService: PasswordService,
    private authService: AuthService
  ) {
    super()
  }

  /**
   * Initiate password reset
   */
  async initiate(ctx: HttpContext) {
    const { request } = ctx
    const data = await request.validateUsing(passwordResetInitiateValidator)

    try {
      // Get device info from context
      const deviceId = this.nellysCoinService.getDeviceId(ctx)

      const resetData = {
        ...data,
        deviceId: deviceId || data.deviceId,
      }

      const result = await this.nellysCoinService.initiatePasswordReset(resetData)

      // Store reset token locally
      const identifier = data.verificationMode === 'email' ? data.emailAddress! : data.phoneNumber!
      await this.passwordService.createResetToken(data.verificationMode, identifier)

      return this.success(
        ctx,
        {
          email_sent: data.verificationMode === 'email',
          sms_sent: data.verificationMode === 'phone',
          expires_in: 900, // 15 minutes
        },
        'If an account exists, a password reset code has been sent'
      )
    } catch (error: any) {
      return this.handleNellysCoinError(ctx, error)
    }
  }

  /**
   * Verify password reset code
   */
  async verifyCode(ctx: HttpContext) {
    const { request } = ctx
    const data = await request.validateUsing(passwordResetVerifyValidator)

    try {
      // Verify token in local DB first
      const identifier = data.verificationMode === 'email' ? data.emailAddress! : data.phoneNumber!
      const token = await this.passwordService.verifyResetToken(
        data.code,
        data.verificationMode,
        identifier
      )

      if (!token) {
        return this.error(ctx, 'Invalid or expired code', ErrorCodes.RESET_INVALID_CODE, 400)
      }

      // Verify with Nellys Coin API
      try {
        const result = await this.nellysCoinService.verifyPasswordResetCode(data)

        return this.success(
          ctx,
          {
            code_valid: true,
            expires_at: token.expiresAt.toISO(),
          },
          'Code verified successfully'
        )
      } catch (error: any) {
        // Increment attempts on API failure
        await this.passwordService.incrementAttempts(token)
        throw error
      }
    } catch (error: any) {
      return this.handleNellysCoinError(ctx, error)
    }
  }

  /**
   * Complete password reset
   */
  async reset(ctx: HttpContext) {
    const { request } = ctx
    const data = await request.validateUsing(passwordResetCompleteValidator)

    try {
      const resetData = {
        ...data,
        password: data.password,
      }

      const result = await this.nellysCoinService.resetPassword(resetData)

      // Mark token as used locally
      const tokens = await PasswordResetToken.query()
        .where('code', data.code)
        .where('isUsed', false)
        .first()

      if (tokens) {
        await this.passwordService.markTokenAsUsed(tokens)
      }

      // If API returns token, format as auth success
      if ((result as any).token) {
        return this.authSuccess(
          ctx,
          (result as any).token,
          null,
          (result as any).expires_in || 3600,
          {
            password_reset: true,
          }
        )
      }

      return this.success(ctx, null, 'Password reset successful')
    } catch (error: any) {
      return this.handleNellysCoinError(ctx, error)
    }
  }
}
