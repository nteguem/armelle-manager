import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { ErrorCodes } from '#services/response_formatter'
import { DateTime } from 'luxon'

export default class PermissionMiddleware {
  async handle(ctx: HttpContext, next: NextFn, permissions: string[]) {
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
      // Load user relationships if not already loaded
      if (!user.roles) {
        await user.load('roles', (query) => {
          query.preload('permissions')
        })
      }
      if (!user.permissions) {
        await user.load('permissions')
      }

      // Get all user permissions (from roles and direct)
      const userPermissions = new Set<string>()

      // Add permissions from roles
      if (user.roles) {
        for (const role of user.roles) {
          if (!role.isActive) continue

          // Check if role assignment is expired
          const pivot = role.$extras.pivot
          if (pivot?.expires_at && DateTime.fromISO(pivot.expires_at) < DateTime.now()) {
            continue
          }

          if (role.permissions) {
            for (const permission of role.permissions) {
              userPermissions.add(permission.name)
            }
          }
        }
      }

      // Add direct permissions
      if (user.permissions) {
        for (const permission of user.permissions) {
          const pivot = permission.$extras.pivot
          // Skip expired permissions
          if (pivot?.expires_at && DateTime.fromISO(pivot.expires_at) < DateTime.now()) {
            continue
          }
          userPermissions.add(permission.name)
        }
      }

      // Check if user has ALL required permissions
      const hasAllPermissions = permissions.every((permission) => {
        // Support wildcard permissions (e.g., users.*)
        if (permission.includes('*')) {
          // const permissionPrefix = permission.replace('*', '')
          const permissionPrefix = permission.slice(0, -1)
          return Array.from(userPermissions).some((userPerm) =>
            userPerm.startsWith(permissionPrefix)
          )
        }
        return userPermissions.has(permission)
      })

      if (!hasAllPermissions) {
        const missingPermissions = permissions.filter((permission) => {
          if (permission.includes('*')) {
            const permissionPrefix = permission.slice(0, -1)
            // const permissionPrefix = permission.replace('*', '')
            return !Array.from(userPermissions).some((userPerm) =>
              userPerm.startsWith(permissionPrefix)
            )
          }
          return !userPermissions.has(permission)
        })

        return response.forbidden({
          status: 'error',
          message: `Access denied. Missing required permissions`,
          code: ErrorCodes.AUTHZ_INSUFFICIENT_PERMISSIONS,
          data: {
            required_permissions: permissions,
            missing_permissions: missingPermissions,
            user_permissions: Array.from(userPermissions),
          },
        })
      }

      // Add user permissions to context for later use
      ctx.userPermissions = Array.from(userPermissions)

      await next()
    } catch (error) {
      return response.internalServerError({
        status: 'error',
        message: 'Error checking user permissions',
        code: ErrorCodes.INTERNAL_SERVER_ERROR,
      })
    }
  }
}
