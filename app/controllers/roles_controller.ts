import type { HttpContext } from '@adonisjs/core/http'
import Role from '#models/role'
import Permission from '#models/permission'
import PermissionService from '#services/permission_service'
import BaseController from '#controllers/base_controller'
import { ErrorCodes } from '#services/response_formatter'
import { inject } from '@adonisjs/core'
import {
  createRoleValidator,
  updateRoleValidator,
  assignPermissionsValidator,
} from '../validators/role_validator.js'

@inject()
export default class RolesController extends BaseController {
  constructor(private permissionService: PermissionService) {
    super()
  }

  /**
   * List all roles
   * GET /api/v1/roles
   */
  async index(ctx: HttpContext) {
    const { request } = ctx
    const page = request.input('page', 1)
    const limit = request.input('limit', 20)
    const includePermissions = request.input('include_permissions', false)

    try {
      const query = Role.query().orderBy('name', 'asc')

      if (includePermissions) {
        query.preload('permissions')
      }

      const roles = await query.paginate(page, limit)

      return this.paginated(
        ctx,
        roles.all().map((role) => ({
          id: role.id,
          name: role.name,
          display_name: role.displayName,
          description: role.description,
          is_active: role.isActive,
          permissions: includePermissions
            ? role.permissions?.map((p) => ({
                id: p.id,
                name: p.name,
                display_name: p.displayName,
                module: p.module,
              }))
            : undefined,
          created_at: role.createdAt,
          updated_at: role.updatedAt,
        })),
        {
          current_page: roles.currentPage,
          total_pages: roles.lastPage,
          per_page: roles.perPage,
          total_items: roles.total,
        }
      )
    } catch (error) {
      return this.error(ctx, 'Failed to fetch roles', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  /**
   * Get a specific role
   * GET /api/v1/roles/:id
   */
  async show(ctx: HttpContext) {
    const { params } = ctx

    try {
      const role = await Role.query()
        .where('id', params.id)
        .preload('permissions')
        .preload('users', (query) => {
          query.limit(10) // Limit users for performance
        })
        .firstOrFail()

      return this.success(ctx, {
        id: role.id,
        name: role.name,
        display_name: role.displayName,
        description: role.description,
        is_active: role.isActive,
        permissions: role.permissions.map((p) => ({
          id: p.id,
          name: p.name,
          display_name: p.displayName,
          module: p.module,
        })),
        users_count: await role
          .related('users')
          .query()
          .count('* as total')
          .first()
          .then((r) => r?.$extras.total || 0),
        sample_users: role.users.map((u) => ({
          id: u.id,
          username: u.username,
          email: u.email,
        })),
        created_at: role.createdAt,
        updated_at: role.updatedAt,
      })
    } catch (error) {
      return this.notFound(ctx, 'Role not found')
    }
  }

  /**
   * Create a new role
   * POST /api/v1/roles
   */
  async store(ctx: HttpContext) {
    const { request, user } = ctx
    const data = await request.validateUsing(createRoleValidator)

    try {
      // Check if role name already exists
      const existingRole = await Role.findBy('name', data.name)
      if (existingRole) {
        return this.error(ctx, 'Role name already exists', ErrorCodes.RESOURCE_ALREADY_EXISTS, 409)
      }

      // Create role
      const role = await Role.create({
        name: data.name,
        displayName: data.displayName,
        description: data.description,
        isActive: data.isActive ?? true,
      })

      // Assign permissions if provided
      if (data.permissionIds && data.permissionIds.length > 0) {
        await this.permissionService.syncRolePermissions(role.id, data.permissionIds)
        await role.load('permissions')
      }

      return this.success(
        ctx,
        {
          id: role.id,
          name: role.name,
          display_name: role.displayName,
          description: role.description,
          is_active: role.isActive,
          permissions:
            role.permissions?.map((p) => ({
              id: p.id,
              name: p.name,
              display_name: p.displayName,
            })) || [],
        },
        'Role created successfully'
      )
    } catch (error) {
      return this.error(ctx, 'Failed to create role', ErrorCodes.INTERNAL_SERVER_ERROR, 500)
    }
  }

  /**
   * Update a role
   * PUT /api/v1/roles/:id
   */
  async update(ctx: HttpContext) {
    const { request, params } = ctx
    const data = await request.validateUsing(updateRoleValidator)

    try {
      const role = await Role.findOrFail(params.id)

      // Prevent updating system roles
      if (['super_admin', 'admin', 'user'].includes(role.name)) {
        return this.error(ctx, 'Cannot modify system roles', ErrorCodes.OPERATION_NOT_ALLOWED, 403)
      }

      // Update role
      role.merge({
        displayName: data.displayName || role.displayName,
        description: data.description !== undefined ? data.description : role.description,
        isActive: data.isActive !== undefined ? data.isActive : role.isActive,
      })

      await role.save()

      // Update permissions if provided
      if (data.permissionIds !== undefined) {
        await this.permissionService.syncRolePermissions(role.id, data.permissionIds)
        await role.load('permissions')
      }

      return this.success(
        ctx,
        {
          id: role.id,
          name: role.name,
          display_name: role.displayName,
          description: role.description,
          is_active: role.isActive,
          permissions:
            role.permissions?.map((p) => ({
              id: p.id,
              name: p.name,
              display_name: p.displayName,
            })) || [],
        },
        'Role updated successfully'
      )
    } catch (error) {
      return this.notFound(ctx, 'Role not found')
    }
  }

  /**
   * Delete a role
   * DELETE /api/v1/roles/:id
   */
  async destroy(ctx: HttpContext) {
    const { params } = ctx

    try {
      const role = await Role.findOrFail(params.id)

      // Prevent deleting system roles
      if (['super_admin', 'admin', 'user', 'manager', 'operator', 'viewer'].includes(role.name)) {
        return this.error(ctx, 'Cannot delete system roles', ErrorCodes.OPERATION_NOT_ALLOWED, 403)
      }

      // Check if role has users
      const usersCount = await role.related('users').query().count('* as total').first()
      if (!usersCount || usersCount?.$extras.total > 0) {
        return this.error(
          ctx,
          'Cannot delete role with assigned users',
          ErrorCodes.OPERATION_NOT_ALLOWED,
          400,
          { users_count: usersCount?.$extras.total || 0 }
        )
      }

      await role.delete()

      return this.success(ctx, null, 'Role deleted successfully')
    } catch (error) {
      return this.notFound(ctx, 'Role not found')
    }
  }

  /**
   * Assign permissions to a role
   * POST /api/v1/roles/:id/permissions
   */
  async assignPermissions(ctx: HttpContext) {
    const { request, params, user } = ctx
    const data = await request.validateUsing(assignPermissionsValidator)

    try {
      const role = await Role.findOrFail(params.id)

      // Verify all permission IDs exist
      const permissions = await Permission.query().whereIn('id', data.permissionIds)
      if (permissions.length !== data.permissionIds.length) {
        return this.error(ctx, 'Some permissions do not exist', ErrorCodes.VALIDATION_ERROR, 400)
      }

      // Sync permissions
      await this.permissionService.syncRolePermissions(role.id, data.permissionIds)
      await role.load('permissions')

      return this.success(
        ctx,
        {
          id: role.id,
          name: role.name,
          display_name: role.displayName,
          permissions: role.permissions.map((p) => ({
            id: p.id,
            name: p.name,
            display_name: p.displayName,
            module: p.module,
          })),
        },
        'Permissions assigned successfully'
      )
    } catch (error) {
      return this.notFound(ctx, 'Role not found')
    }
  }
}
