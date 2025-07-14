import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import Role from '#models/role'
import PermissionService from '#services/permission_service'
import BaseController from '#controllers/base_controller'
import { ErrorCodes } from '#services/response_formatter'
import { inject } from '@adonisjs/core'
import { DateTime } from 'luxon'

@inject()
export default class UsersController extends BaseController {
  constructor(private permissionService: PermissionService) {
    super()
  }

  /**
   * List all users
   * GET /api/v1/users
   */
  async index(ctx: HttpContext) {
    const { request } = ctx
    const page = request.input('page', 1)
    const limit = request.input('limit', 20)
    const includeRoles = request.input('include_roles', false)

    try {
      const query = User.query().orderBy('username', 'asc')

      if (includeRoles) {
        query.preload('roles')
      }

      const users = await query.paginate(page, limit)

      return this.paginated(
        ctx,
        users.all().map((user) => ({
          id: user.id,
          username: user.username,
          email: user.email,
          nellys_coin_id: user.nellysCoinId,
          can_access_panel: user.canAccessPanel,
          roles: includeRoles
            ? user.roles?.map((role) => ({
                id: role.id,
                name: role.name,
                display_name: role.displayName,
              }))
            : undefined,
          created_at: user.createdAt,
          updated_at: user.updatedAt,
        })),
        {
          current_page: users.currentPage,
          total_pages: users.lastPage,
          per_page: users.perPage,
          total_items: users.total,
        }
      )
    } catch (error) {
      return this.error(ctx, 'Failed to fetch users', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  /**
   * Get a specific user
   * GET /api/v1/users/:id
   */
  async show(ctx: HttpContext) {
    const { params } = ctx

    try {
      const user = await User.query()
        .where('id', params.id)
        .preload('roles', (query) => {
          query.preload('permissions')
        })
        .preload('permissions')
        .firstOrFail()

      const allPermissions = await user.getAllPermissions()
      const activeRoles = await user.getActiveRoles()

      return this.success(ctx, {
        id: user.id,
        username: user.username,
        email: user.email,
        nellys_coin_id: user.nellysCoinId,
        can_access_panel: user.canAccessPanel,
        roles: activeRoles.map((role) => ({
          id: role.id,
          name: role.name,
          display_name: role.displayName,
          permissions: role.permissions?.map((p) => ({
            id: p.id,
            name: p.name,
            display_name: p.displayName,
            module: p.module,
          })),
        })),
        direct_permissions: user.permissions?.map((p) => ({
          id: p.id,
          name: p.name,
          display_name: p.displayName,
          module: p.module,
          granted_at: p.$extras.pivot?.granted_at,
          expires_at: p.$extras.pivot?.expires_at,
        })),
        all_permissions: allPermissions,
        created_at: user.createdAt,
        updated_at: user.updatedAt,
      })
    } catch (error) {
      return this.notFound(ctx, 'User not found')
    }
  }

  /**
   * Get user roles
   * GET /api/v1/users/:userId/roles
   */
  async getUserRoles(ctx: HttpContext) {
    const { params } = ctx

    try {
      const user = await User.findOrFail(params.userId)
      await user.load('roles')

      const activeRoles = await user.getActiveRoles()

      return this.success(ctx, {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
        roles: activeRoles.map((role) => ({
          id: role.id,
          name: role.name,
          display_name: role.displayName,
          assigned_at: role.$extras.pivot?.assigned_at,
          expires_at: role.$extras.pivot?.expires_at,
        })),
        roles_count: activeRoles.length,
      })
    } catch (error) {
      return this.notFound(ctx, 'User not found')
    }
  }

  /**
   * Assign role to user
   * POST /api/v1/users/:userId/roles
   */
  async assignRole(ctx: HttpContext) {
    const { request, params, user: currentUser } = ctx
    const userId = params.userId
    const { roleId, expiresAt } = request.only(['roleId', 'expiresAt'])

    try {
      // Validate user exists
      const user = await User.findOrFail(userId)
      // Validate role exists
      const role = await Role.findOrFail(roleId)
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

      // Check if role is already assigned
      const existingAssignment = await user
        .related('roles')
        .query()
        .where('role_id', role.id)
        .first()

      if (existingAssignment) {
        return this.error(
          ctx,
          'Role is already assigned to this user',
          ErrorCodes.RESOURCE_ALREADY_EXISTS,
          409
        )
      }

      // Assign role
      await this.permissionService.assignRoleToUser(
        user.id,
        role.id,
        currentUser!.id,
        expirationDate
      )

      return this.success(
        ctx,
        {
          user_id: user.id,
          role: {
            id: role.id,
            name: role.name,
            display_name: role.displayName,
          },
          assigned_by: currentUser!.username,
          assigned_at: DateTime.now(),
          expires_at: expirationDate,
        },
        'Role assigned successfully'
      )
    } catch (error) {
      console.error('Error in assignRole:', error)
      return this.notFound(ctx, 'User or role not found')
    }
  }

  /**
   * Remove role from user
   * DELETE /api/v1/users/:userId/roles/:roleId
   */
  async removeRole(ctx: HttpContext) {
    const { params, user: currentUser } = ctx
    const userId = params.userId
    const roleId = params.roleId

    try {
      // Validate user and role exist
      const user = await User.findOrFail(userId)
      const role = await Role.findOrFail(roleId)

      // Check if role is assigned
      const assignment = await user.related('roles').query().where('role_id', role.id).first()

      if (!assignment) {
        return this.error(
          ctx,
          'Role is not assigned to this user',
          ErrorCodes.RESOURCE_NOT_FOUND,
          404
        )
      }

      // Prevent removing system roles from admin users (optional security)
      if (['super_admin', 'admin'].includes(role.name) && user.id === currentUser!.id) {
        return this.error(
          ctx,
          'Cannot remove admin role from yourself',
          ErrorCodes.OPERATION_NOT_ALLOWED,
          403
        )
      }

      // Remove role
      await this.permissionService.removeRoleFromUser(user.id, role.id)

      return this.success(
        ctx,
        {
          user_id: user.id,
          role_id: role.id,
          removed_by: currentUser!.username,
          removed_at: DateTime.now(),
        },
        'Role removed successfully'
      )
    } catch (error) {
      return this.notFound(ctx, 'User or role not found')
    }
  }
}
