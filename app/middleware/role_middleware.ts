import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { ErrorCodes } from '#services/response_formatter'

export default class RoleMiddleware {
  async handle(ctx: HttpContext, next: NextFn, roles: string[]) {
    const { user, response } = ctx

    // Check if user exists (should be set by auth middleware)
    if (!user) {
      return response.unauthorized({
        status: 'error',
        message: 'Authentication required',
        code: ErrorCodes.AUTH_TOKEN_MISSING,
      })
    }

    try {
      // Load user roles if not already loaded
      if (!user.roles) {
        await user.load('roles')
      }

      // Check if user has any of the required roles
      const userRoles = user.roles || []
      const userRoleNames = userRoles
        .filter((role: any) => role.isActive)
        .map((role: any) => role.name)

      const hasRequiredRole = roles.some((role) => userRoleNames.includes(role))

      if (!hasRequiredRole) {
        return response.forbidden({
          status: 'error',
          message: `Access denied. Required role(s): ${roles.join(', ')}`,
          code: ErrorCodes.AUTHZ_INSUFFICIENT_PERMISSIONS,
          data: {
            required_roles: roles,
            user_roles: userRoleNames,
          },
        })
      }

      await next()
    } catch (error) {
      return response.internalServerError({
        status: 'error',
        message: 'Error checking user roles',
        code: ErrorCodes.INTERNAL_SERVER_ERROR,
      })
    }
  }
}
