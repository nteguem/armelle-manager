import type { HttpContext } from '@adonisjs/core/http'
import Permission from '#models/permission'
import User from '#models/user'
import PermissionService from '#services/permission_service'
import BaseController from '#controllers/base_controller'
import { ErrorCodes } from '#services/response_formatter'
import { inject } from '@adonisjs/core'
import { DateTime } from 'luxon'

@inject()
export default class PermissionsController extends BaseController {
  constructor(private permissionService: PermissionService) {
    super()
  }

  /**
   * List all permissions
   * GET /api/v1/permissions
   */
  async index(ctx: HttpContext) {
    const { request } = ctx
    const module = request.input('module')
    const grouped = request.input('grouped', false)

    try {
      if (grouped) {
        // Return permissions grouped by module
        const groupedPermissions = await Permission.getGroupedByModule()

        const formattedGroups = Object.entries(groupedPermissions).map(
          ([moduleName, permissions]) => ({
            module: moduleName,
            permissions: permissions.map((p) => ({
              id: p.id,
              name: p.name,
              display_name: p.displayName,
              description: p.description,
            })),
          })
        )

        return this.success(ctx, {
          groups: formattedGroups,
          total_modules: formattedGroups.length,
          total_permissions: Object.values(groupedPermissions).flat().length,
        })
      }

      // Regular list with optional module filter
      const query = Permission.query().orderBy('module', 'asc').orderBy('name', 'asc')

      if (module) {
        query.where('module', module)
      }

      const permissions = await query

      return this.success(ctx, {
        permissions: permissions.map((p) => ({
          id: p.id,
          name: p.name,
          display_name: p.displayName,
          description: p.description,
          module: p.module,
          created_at: p.createdAt,
          updated_at: p.updatedAt,
        })),
        total: permissions.length,
      })
    } catch (error) {
      return this.error(ctx, 'Failed to fetch permissions', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  /**
   * Get available modules
   * GET /api/v1/permissions/modules
   */
  async modules(ctx: HttpContext) {
    try {
      const modules = await Permission.query().distinct('module').orderBy('module', 'asc')

      return this.success(ctx, {
        modules: modules.map((p) => p.module),
        total: modules.length,
      })
    } catch (error) {
      return this.error(ctx, 'Failed to fetch modules', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  /**
   * Get user permissions
   * GET /api/v1/users/:userId/permissions
   */
  async userPermissions(ctx: HttpContext) {
    const { params } = ctx

    try {
      const user = await User.findOrFail(params.userId)

      // Get all permissions
      const permissions = await this.permissionService.getUserPermissions(user.id)

      // Load user roles and direct permissions for details
      await user.load('roles', (query) => {
        query.preload('permissions')
      })
      await user.load('permissions')

      // Separate permissions by source
      const rolePermissions: any[] = []
      const directPermissions: any[] = []

      // Permissions from roles
      for (const role of user.roles) {
        for (const permission of role.permissions) {
          rolePermissions.push({
            id: permission.id,
            name: permission.name,
            display_name: permission.displayName,
            module: permission.module,
            source: 'role',
            role: {
              id: role.id,
              name: role.name,
              display_name: role.displayName,
            },
          })
        }
      }

      // Direct permissions
      for (const permission of user.permissions) {
        directPermissions.push({
          id: permission.id,
          name: permission.name,
          display_name: permission.displayName,
          module: permission.module,
          source: 'direct',
          granted_at: permission.$extras.pivot?.granted_at,
          expires_at: permission.$extras.pivot?.expires_at,
        })
      }

      return this.success(ctx, {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
        all_permissions: permissions,
        permissions_count: permissions.length,
        role_permissions: rolePermissions,
        direct_permissions: directPermissions,
      })
    } catch (error) {
      return this.notFound(ctx, 'User not found')
    }
  }

  /**
   * Grant direct permission to user
   * POST /api/v1/users/:userId/permissions
   */
  async grantToUser(ctx: HttpContext) {
    const { request, params, user: currentUser } = ctx
    const userId = params.userId
    const { permissionId, expiresAt } = request.only(['permissionId', 'expiresAt'])

    try {
      // Validate user exists
      const user = await User.findOrFail(userId)

      // Validate permission exists
      const permission = await Permission.findOrFail(permissionId)

      // Parse expiration date if provided
      const expirationDate = expiresAt ? DateTime.fromISO(expiresAt) : undefined
      if (expirationDate && expirationDate < DateTime.now()) {
        return this.error(
          ctx,
          'Expiration date must be in the future',
          ErrorCodes.VALIDATION_ERROR,
          400
        )
      }

      // Grant permission
      await this.permissionService.grantPermissionToUser(
        user.id,
        permission.id,
        currentUser!.id,
        expirationDate
      )

      return this.success(
        ctx,
        {
          user_id: user.id,
          permission: {
            id: permission.id,
            name: permission.name,
            display_name: permission.displayName,
          },
          granted_by: currentUser!.username,
          granted_at: DateTime.now(),
          expires_at: expirationDate,
        },
        'Permission granted successfully'
      )
    } catch (error) {
      return this.notFound(ctx, 'User or permission not found')
    }
  }

  /**
   * Revoke direct permission from user
   * DELETE /api/v1/users/:userId/permissions/:permissionId
   */
  async revokeFromUser(ctx: HttpContext) {
    const { params } = ctx
    const userId = params.userId
    const permissionId = params.permissionId

    try {
      // Validate user and permission exist
      await User.findOrFail(userId)
      await Permission.findOrFail(permissionId)

      // Revoke permission
      await this.permissionService.revokePermissionFromUser(userId, permissionId)

      return this.success(ctx, null, 'Permission revoked successfully')
    } catch (error) {
      return this.notFound(ctx, 'User or permission not found')
    }
  }

  /**
   * Check if user has permission
   * GET /api/v1/users/:userId/permissions/check
   */
  async checkUserPermission(ctx: HttpContext) {
    const { request, params } = ctx
    const userId = params.userId
    const permissionName = request.input('permission')

    if (!permissionName) {
      return this.validationError(ctx, {
        permission: ['Permission name is required'],
      })
    }

    try {
      const user = await User.findOrFail(userId)
      const hasPermission = await this.permissionService.userHasPermission(user.id, permissionName)

      return this.success(ctx, {
        user_id: user.id,
        permission: permissionName,
        has_permission: hasPermission,
      })
    } catch (error) {
      return this.notFound(ctx, 'User not found')
    }
  }

  /**
   * Get users with a specific permission
   * GET /api/v1/permissions/:name/users
   */
  async getUsersWithPermission(ctx: HttpContext) {
    const { params, request } = ctx
    const permissionName = params.name
    const page = request.input('page', 1)
    const limit = request.input('limit', 20)

    try {
      const permission = await Permission.findByOrFail('name', permissionName)
      const users = await this.permissionService.getUsersWithPermission(permission.name)

      // Manual pagination
      const start = (page - 1) * limit
      const paginatedUsers = users.slice(start, start + limit)

      return this.paginated(
        ctx,
        paginatedUsers.map((user) => ({
          id: user.id,
          username: user.username,
          email: user.email,
          nellys_coin_id: user.nellysCoinId,
        })),
        {
          current_page: page,
          total_pages: Math.ceil(users.length / limit),
          per_page: limit,
          total_items: users.length,
        }
      )
    } catch (error) {
      return this.notFound(ctx, 'Permission not found')
    }
  }
}
