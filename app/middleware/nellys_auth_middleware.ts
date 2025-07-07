import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import AuthService from '#services/auth_service'
import { inject } from '@adonisjs/core'

@inject()
export default class NellysAuthMiddleware {
  constructor(private authService: AuthService) {}

  async handle(ctx: HttpContext, next: NextFn) {
    const { request, response } = ctx

    // Get token from header or query
    const token = this.extractToken(request)

    if (!token) {
      return response.unauthorized({
        message: 'Missing authentication token',
        errorCode: 'AUTH_TOKEN_MISSING',
      })
    }

    try {
      // Verify token and get user
      const user = await this.authService.getUserByToken(token)

      if (!user) {
        return response.unauthorized({
          message: 'Invalid or expired token',
          errorCode: 'AUTH_TOKEN_INVALID',
        })
      }

      // Add user to context
      ctx.user = user

      // Add helper to check panel access
      ctx.canAccessPanel = () => user.canAccessPanel

      await next()
    } catch (error) {
      return response.unauthorized({
        message: 'Authentication failed',
        errorCode: 'AUTH_ERROR',
      })
    }
  }

  /**
   * Extract token from request
   */
  private extractToken(request: any): string | null {
    // Check Authorization header
    const authHeader = request.header('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7)
    }

    // Check query parameter
    return request.input('token') || null
  }
}
