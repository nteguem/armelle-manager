import BaseController from '#controllers/base_controller'
import { decode, encode } from '#lib/jwt'
import Role from '#models/role'
import User from '#models/user'
import AuthService from '#services/auth_service'
import NellysCoinService from '#services/nellys_coin_service'
import { ErrorCodes } from '#services/response_formatter'
import {
  loginValidator,
  mfaConfirmValidator,
  mfaVerifyValidator,
  refreshTokenValidator,
} from '#validators/auth_validator'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class AuthController extends BaseController {
  constructor(
    protected nellysCoinService: NellysCoinService,
    protected authService: AuthService
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
        ...locationInfo,
      }

      const result = await this.nellysCoinService.login(loginData)
      if (result.data.loginReference) {
        await this.authService.createMfaSession(result)
        return this.success(ctx, result.data, 'Login successful')
      }

      // Save user
      const user = await this.authService.saveUser(result)

      // Assign 'user' role by default if not already assigned
      const defaultUserRole = await Role.findBy('name', 'user')
      if (defaultUserRole) {
        await user.related('roles').sync([defaultUserRole.id], false)
      }

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

      const serializeData = {
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

      const dataAccessToken = encode(serializeData)

      return this.authSuccess(
        ctx,
        result.data.authToken,
        result.data.refreshToken,
        result.data.expiresIn || 3600,
        {
          ...serializeData,
        },
        dataAccessToken
      )
    } catch (error: any) {
      return this.handleNellysCoinError(ctx, error)
    }
  }

  /**
   * Handle MFA configuration - Setup authenticator with code
   */
  async handleMfaConfiguration(ctx: HttpContext) {
    const { request } = ctx
    const authHeader = request.header('Authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Unauthorized')
    }

    const authToken = authHeader.split(' ')[1]

    try {
      const result = await this.nellysCoinService.setupAuthenticator(authToken)

      return result
    } catch (error: any) {
      return this.handleNellysCoinError(ctx, error)
    }
  }

  /**
   * Handle MFA verification - Validate authenticator setup
   */
  async handleMfaVerification(ctx: HttpContext) {
    const { request } = ctx
    const data = await request.validateUsing(mfaVerifyValidator)
    const authHeader = request.header('Authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Unauthorized')
    }

    const authToken = authHeader.split(' ')[1]
    try {
      const result = await this.nellysCoinService.verifyAuthenticatorCode(data.code, authToken)

      return result
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
        // Get the stored login response to restore token
        const result = await this.nellysCoinService.confirmMfa(data)

        // Complete MFA session
        await this.authService.completeMfaSession(mfaSession, result.data.customerData.username)

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

        const serializeData = {
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

        const accessDataToken = encode(serializeData)

        return this.success(
          ctx,
          {
            data_access_token: accessDataToken,
            access_token: result.data.authToken,
            token_type: 'Bearer',
            refresh_token: result.data.refreshToken,
            expires_in: result.data.expiresIn || 3600,
          },
          'Login successful'
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
   * Get connected user -> /me
   */
  async getConnectedUser(ctx: HttpContext) {
    const { request } = ctx
    const authHeader = request.header('x-data-access-token')

    if (!authHeader) {
      return this.unauthorized(
        ctx,
        'Unauthorized - No access token provided',
        ErrorCodes.AUTH_TOKEN_INVALID
      )
    }

    try {
      const decodedData = decode(authHeader!)
      const userId = decodedData.id

      if (!userId) {
        return this.unauthorized(
          ctx,
          'Unauthorized - Invalid access token',
          ErrorCodes.AUTH_TOKEN_INVALID
        )
      }

      const user = await User.query()
        .where('id', userId)
        .preload('roles', (query) => {
          query.preload('permissions')
        })
        .preload('permissions')
        .first()

      if (!user) {
        return this.unauthorized(
          ctx,
          'Unauthorized - User not found',
          ErrorCodes.AUTH_TOKEN_INVALID
        )
      }

      const allPermissions = await user.getAllPermissions()
      const activeRoles = await user.getActiveRoles()

      return this.success(
        ctx,
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
        },
        'User fetched successfully'
      )
    } catch (error) {
      return this.unauthorized(ctx, 'Unauthorized', ErrorCodes.AUTH_TOKEN_INVALID)
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
