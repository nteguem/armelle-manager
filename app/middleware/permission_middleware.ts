import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { ErrorCodes } from '#services/response_formatter'
import PermissionService from '#services/permission_service'

export default class PermissionMiddleware {
  private permissionService: PermissionService

  constructor() {
    this.permissionService = new PermissionService()
  }

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
      // Get all user permissions using the service (single source of truth)
      const userPermissions = await this.permissionService.getUserPermissions(user.id)
      const userPermissionsSet = new Set(userPermissions)

      // Check if user has ALL required permissions
      const missingPermissions: string[] = []

      for (const permission of permissions) {
        let hasPermission = false

        // Check exact match
        if (userPermissionsSet.has(permission)) {
          hasPermission = true
        }
        // Check wildcard permissions (e.g., users.*)
        else if (permission.includes('*')) {
          const permissionPrefix = permission.slice(0, -1) // Remove the *
          hasPermission = userPermissions.some((userPerm) => userPerm.startsWith(permissionPrefix))
        }
        // Check if user has wildcard for this specific permission (e.g., user has users.* and needs users.create)
        else {
          const permissionParts = permission.split('.')
          if (permissionParts.length > 1) {
            const wildcardPermission = `${permissionParts[0]}.*`
            hasPermission = userPermissionsSet.has(wildcardPermission)
          }
        }

        if (!hasPermission) {
          missingPermissions.push(permission)
        }
      }

      // If there are missing permissions, deny access
      if (missingPermissions.length > 0) {
        return response.forbidden({
          status: 'error',
          message: `Access denied. Missing required permissions`,
          code: ErrorCodes.AUTHZ_INSUFFICIENT_PERMISSIONS,
          data: {
            required_permissions: permissions,
            missing_permissions: missingPermissions,
            user_permissions: userPermissions,
            user_info: {
              id: user.id,
              username: user.username,
              email: user.email,
            },
          },
        })
      }

      // Add user permissions to context for later use (useful for controllers)
      ctx.userPermissions = userPermissions

      await next()
    } catch (error) {
      console.error('Error in PermissionMiddleware:', error)

      return response.internalServerError({
        status: 'error',
        message: 'Error checking user permissions',
        code: ErrorCodes.INTERNAL_SERVER_ERROR,
        data: {
          user_id: user.id,
          required_permissions: permissions,
        },
      })
    }
  }

  /**
   * Helper method to check single permission (can be used in controllers)
   */
  async checkUserPermission(userId: number, permission: string): Promise<boolean> {
    try {
      return await this.permissionService.userHasPermission(userId, permission)
    } catch (error) {
      console.error('Error checking single permission:', error)
      return false
    }
  }

  /**
   * Helper method to get user permissions (can be used in controllers)
   */
  async getUserPermissions(userId: number): Promise<string[]> {
    try {
      return await this.permissionService.getUserPermissions(userId)
    } catch (error) {
      console.error('Error getting user permissions:', error)
      return []
    }
  }
}
