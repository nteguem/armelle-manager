import type { HttpContext } from '@adonisjs/core/http'
import Permission from '#models/permission'
import User from '#models/user'
import PermissionService from '#services/permission_service'
import BaseController from '#controllers/base_controller'
import { ErrorCodes } from '#services/response_formatter'
import { inject } from '@adonisjs/core'
import { DateTime } from 'luxon'
import {
  grantPermissionToUserValidator,
  checkUserPermissionValidator,
  permissionSearchValidator,
} from '#validators/permission_validator'

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
    const data = await request.validateUsing(permissionSearchValidator)
    const { module, grouped = false, page = 1, limit = 20 } = data

    try {
      if (grouped) {
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

      const query = Permission.query().orderBy('module', 'asc').orderBy('name', 'asc')

      if (module) {
        query.where('module', module)
      }

      const paginatedResult = await query.paginate(page, limit)
      const permissions = paginatedResult.all()

      const formattedPermissions = permissions.map((p) => ({
        id: p.id,
        name: p.name,
        display_name: p.displayName,
        description: p.description,
        module: p.module,
        created_at: p.createdAt,
        updated_at: p.updatedAt,
      }))

      return this.paginated(ctx, formattedPermissions, {
        current_page: paginatedResult.currentPage,
        total_pages: paginatedResult.lastPage,
        per_page: paginatedResult.perPage,
        total_items: paginatedResult.total,
      })
    } catch (error) {
      console.error('Error fetching permissions:', error)
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
      console.error('Error fetching modules:', error)
      return this.error(ctx, 'Failed to fetch modules', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  /**
   * Get user permissions
   * GET /api/v1/users/:userId/permissions
   */
  async userPermissions(ctx: HttpContext) {
    const { params, request } = ctx
    const page = request.input('page', 1)
    const limit = request.input('limit', 20)
    const source = request.input('source')

    try {
      const user = await User.findOrFail(params.userId)

      const permissions = await this.permissionService.getUserPermissions(user.id)

      await user.load('roles', (query) => {
        query.preload('permissions')
      })
      await user.load('permissions')

      const rolePermissions: any[] = []
      const directPermissions: any[] = []

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

      let allPermissionsWithSource = [...rolePermissions, ...directPermissions]
      if (source) {
        allPermissionsWithSource = allPermissionsWithSource.filter((p) => p.source === source)
      }

      const start = (page - 1) * limit
      const paginatedPermissions = allPermissionsWithSource.slice(start, start + limit)

      const requestId = this.getRequestId(ctx)

      return ctx.response.ok({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
          },
          all_permissions: permissions,
          permissions_count: permissions.length,
          role_permissions_count: rolePermissions.length,
          direct_permissions_count: directPermissions.length,
          permissions: paginatedPermissions,
        },
        pagination: {
          current_page: page,
          total_pages: Math.ceil(allPermissionsWithSource.length / limit),
          per_page: limit,
          total_items: allPermissionsWithSource.length,
        },
        request_id: requestId,
      })
    } catch (error) {
      console.error('Error fetching user permissions:', error)
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
    const data = await request.validateUsing(grantPermissionToUserValidator)

    try {
      const user = await User.findOrFail(userId)
      const permission = await Permission.findOrFail(data.permissionId)

      //  Gérer l'objet Date du validator
      const expirationDate = data.expiresAt ? DateTime.fromJSDate(data.expiresAt) : undefined

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
      console.error('Error granting permission:', error)
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
      await User.findOrFail(userId)
      await Permission.findOrFail(permissionId)

      await this.permissionService.revokePermissionFromUser(userId, permissionId)

      return this.success(ctx, null, 'Permission revoked successfully')
    } catch (error) {
      console.error('Error revoking permission:', error)
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
    const data = await request.validateUsing(checkUserPermissionValidator)

    try {
      const user = await User.findOrFail(userId)
      const hasPermission = await this.permissionService.userHasPermission(user.id, data.permission)

      return this.success(ctx, {
        user_id: user.id,
        permission: data.permission,
        has_permission: hasPermission,
      })
    } catch (error) {
      console.error('Error checking user permission:', error)
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

      const start = (page - 1) * limit
      const paginatedUsers = users.slice(start, start + limit)

      const formattedUsers = paginatedUsers.map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        nellys_coin_id: user.nellysCoinId,
      }))

      return this.paginated(ctx, formattedUsers, {
        current_page: page,
        total_pages: Math.ceil(users.length / limit),
        per_page: limit,
        total_items: users.length,
      })
    } catch (error) {
      console.error('Error fetching users with permission:', error)
      return this.notFound(ctx, 'Permission not found')
    }
  }
}
