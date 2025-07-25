import BaseController from '#controllers/base_controller'
import User from '#models/user'
import AuthService from '#services/auth_service'
import MfaMemoryStore from '#services/mfa_memory_store'
import NellysCoinService from '#services/nellys_coin_service'
import { ErrorCodes } from '#services/response_formatter'
import {
  loginValidator,
  mfaConfirmValidator,
  mfaSetupValidator,
  mfaVerifyValidator,
  refreshTokenValidator,
} from '#validators/auth_validator'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { LoginResponse } from '../types/nellys_coin_types.js'

@inject()
export default class AuthController extends BaseController {
  private loginResponse: LoginResponse | null = null

  constructor(
    private nellysCoinService: NellysCoinService,
    private authService: AuthService
  ) {
    super()
  }

  setLoginResponse(loginReference: string, value: LoginResponse) {
    this.loginResponse = value
    MfaMemoryStore.set(loginReference, value)
  }

  getLoginResponse(loginReference: string): LoginResponse | null {
    return MfaMemoryStore.get(loginReference)
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

      // Encrypt password before sending
      const encryptedPassword = data.password

      const loginData = {
        ...data,
        password: encryptedPassword,
        ...locationInfo,
      }

      const result = await this.nellysCoinService.login(loginData)

      // Store MFA session in memory
      this.setLoginResponse(result.data.loginReference!, result)

      // Check if MFA is required
      if (result.data.shouldCompleteMfa === false) {
        // Complete MFA setup
        return this.success(
          ctx,
          {
            mfa_required: true,
            shouldCompleteMfa: result.data.shouldCompleteMfa,
            login_token: result.token,
          },
          'Please complete your MFA setup to continue.'
        )
      } else if (result.data.shouldCompleteMfa) {
        // Create MFA session
        await this.authService.createMfaSession(result, data.log)

        return this.success(
          ctx,
          {
            mfa_required: true,
            shouldCompleteMfa: result.data.shouldCompleteMfa,
            login_reference: result.data.loginReference,
            mfa_data: result.data.mfaData,
          },
          'Finish to setup authenticator'
        )
      }

      // // Login successful without MFA - save user
      // const user = await this.authService.saveUser(result)

      // // Load roles and permissions
      // const userWithRelations = await User.query()
      //   .where('id', user.id)
      //   .preload('roles', (query) => {
      //     query.preload('permissions')
      //   })
      //   .preload('permissions')
      //   .first()

      // const allPermissions = await userWithRelations!.getAllPermissions()
      // const activeRoles = await userWithRelations!.getActiveRoles()

      // return this.authSuccess(
      //   ctx,
      //   result.token!,
      //   result.refresh_token || null,
      //   result.expires_in || 3600,
      //   {
      //     id: user.id,
      //     email: user.email,
      //     username: user.username,
      //     can_access_panel: user.canAccessPanel,
      //     roles: activeRoles.map((role) => ({
      //       id: role.id,
      //       name: role.name,
      //       display_name: role.displayName,
      //     })),
      //     permissions: allPermissions,
      //   }
      // )
    } catch (error: any) {
      return this.handleNellysCoinError(ctx, error)
    }
  }

  /**
   * Handle MFA configuration
   */
  async handleMfaConfiguration(ctx: HttpContext) {
    const { request } = ctx
    console.log('MFA SETUP VALIDATOR', request.body())

    const data = await request.validateUsing(mfaSetupValidator)

    try {
      // Complete MFA setup
      const result = await this.nellysCoinService.setupAuthenticator(data.loginReference)

      console.log('AUTHENTICATOR SETUP RESULT', result)

      return this.success(
        ctx,
        {
          mfa_required: true,
          shouldCompleteMfa: result.data.shouldCompleteMfa,
          login_reference: result.data.loginReference,
          mfa_data: result.data,
        },
        'Finish to setup authenticator'
      )
    } catch (error: any) {
      return this.handleNellysCoinError(ctx, error)
    }
  }

  /**
   * Handle MFA verification
   */
  async handleMfaVerification(ctx: HttpContext) {
    const { request } = ctx
    const data = await request.validateUsing(mfaVerifyValidator)

    try {
      const result = await this.nellysCoinService.verifyAuthenticatorCode(
        data.code,
        data.loginReference
      )

      console.log('MFA VERIFY RESULT', result)
    } catch (error: any) {
      throw error
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

        // Load roles and permissions
        const userWithRelations = await User.query()
          .where('id', user.id)
          .preload('roles', (query) => {
            query.preload('permissions')
          })
          .preload('permissions')
          .first()

        const allPermissions = await userWithRelations!.getAllPermissions()
        const activeRoles = await userWithRelations!.getActiveRoles()

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
            roles: activeRoles.map((role) => ({
              id: role.id,
              name: role.name,
              display_name: role.displayName,
            })),
            permissions: allPermissions,
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
