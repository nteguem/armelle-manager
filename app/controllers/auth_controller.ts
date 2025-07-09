import type { HttpContext } from '@adonisjs/core/http'
import NellysCoinService from '#services/nellys_coin_service'
import AuthService from '#services/auth_service'
import BaseController from '#controllers/base_controller'
import { ErrorCodes } from '#services/response_formatter'
import {
  loginValidator,
  mfaConfirmValidator,
  refreshTokenValidator,
} from '#validators/auth_validator'
import { inject } from '@adonisjs/core'

@inject()
export default class AuthController extends BaseController {
  constructor(
    private nellysCoinService: NellysCoinService,
    private authService: AuthService
  ) {
    super()
  }

  /**
   * Handle login request
   */
  async login(ctx: HttpContext) {
    const { request } = ctx
    const data = await request.validateUsing(loginValidator)

    try {
      // Get location info
      const locationInfo = this.nellysCoinService.getLocationInfo(ctx)

      const loginData = {
        ...data,
        password: data.password,
        ...locationInfo,
      }

      const result = await this.nellysCoinService.login(loginData)

      // Check if MFA is required
      if (result.data.shouldCompleteMfa) {
        // Create MFA session
        await this.authService.createMfaSession(result, data.log)
        return this.success(
          ctx,
          {
            mfa_required: true,
            login_reference: result.data.loginReference,
            shouldCompleteMfa: result.data.shouldCompleteMfa,
            mfa_data: result.data.mfaData,
          },
          'MFA verification required'
        )
      }

      // Login successful without MFA - save user
      const user = await this.authService.saveUser(result)

      return this.authSuccess(
        ctx,
        result.token!,
        result.refresh_token || null,
        result.expires_in || 3600,
        {
          id: user.id,
          email: user.email,
          username: user.username,
          can_access_panel: user.canAccessPanel,
        }
      )
    } catch (error: any) {
      return this.handleNellysCoinError(ctx, error)
    }
  }

  /**
   * Confirm MFA code
   */
  async confirmMfaCode(ctx: HttpContext) {
    const { request } = ctx
    const data = await request.validateUsing(mfaConfirmValidator)

    try {
      // Verify MFA session exists
      const mfaSession = await this.authService.verifyMfaSession(data.loginReference)

      if (!mfaSession) {
        return this.error(
          ctx,
          'Invalid or expired MFA session',
          ErrorCodes.AUTH_MFA_SESSION_INVALID,
          400
        )
      }

      try {
        const result = await this.nellysCoinService.confirmMfa(data)

        // Complete MFA session
        await this.authService.completeMfaSession(mfaSession)

        // Save user
        const user = await this.authService.saveUser(result)

        return this.authSuccess(
          ctx,
          result.token!,
          result.refresh_token || null,
          result.expires_in || 3600,
          {
            id: user.id,
            email: user.email,
            username: user.username,
            can_access_panel: user.canAccessPanel,
          }
        )
      } catch (error: any) {
        // Increment attempts on failure
        await this.authService.incrementMfaAttempts(mfaSession)

        // Add attempts remaining info
        const attemptsRemaining = 5 - mfaSession.attempts - 1
        if (attemptsRemaining > 0) {
          error.data = { attempts_remaining: attemptsRemaining }
        }

        throw error
      }
    } catch (error: any) {
      return this.handleNellysCoinError(ctx, error)
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(ctx: HttpContext) {
    const { request } = ctx
    const data = await request.validateUsing(refreshTokenValidator)

    try {
      // TODO: Implement token refresh logic with Nellys Coin API
      // For now, returning a placeholder response
      return this.success(
        ctx,
        {
          access_token: 'new-jwt-token',
          token_type: 'Bearer',
          expires_in: 3600,
        },
        'Token refreshed successfully'
      )
    } catch (error: any) {
      return this.unauthorized(ctx, 'Invalid refresh token', ErrorCodes.AUTH_TOKEN_INVALID)
    }
  }

  /**
   * Logout user
   */
  async logout(ctx: HttpContext) {
    const { user } = ctx

    try {
      if (user) {
        // Invalidate tokens in database
        await this.authService.invalidateTokens(user.id)
      }

      return this.success(ctx, null, 'Successfully logged out')
    } catch (error: any) {
      return this.error(ctx, 'Logout failed', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }
}
