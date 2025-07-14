import User from '#models/user'
import Role from '#models/role'
import Permission from '#models/permission'
import UserRole from '#models/user_role'
import UserPermission from '#models/user_permission'
import { DateTime } from 'luxon'
import Database from '@adonisjs/lucid/services/db'

export default class PermissionService {
  /**
   * Get all permissions for a user (from roles and direct)
   */
  async getUserPermissions(userId: number): Promise<string[]> {
    const user = await User.find(userId)
    if (!user) return []

    await user.load('roles' as any, (query) => {
      query.preload('permissions' as any).where('is_active', true)
    })
    await user.load('permissions' as any)

    const permissions = new Set<string>()

    // Permissions from roles
    const userRoles = (user as any).roles || []
    for (const role of userRoles) {
      const pivot = role.$extras.pivot
      if (pivot?.expires_at && DateTime.fromJSDate(pivot.expires_at) < DateTime.now()) {
        continue
      }

      const rolePermissions = (role as any).permissions || []
      for (const permission of rolePermissions) {
        permissions.add(permission.name)
      }
    }

    // Direct permissions
    const userPermissions = (user as any).permissions || []
    for (const permission of userPermissions) {
      const pivot = permission.$extras.pivot
      if (pivot?.expires_at && DateTime.fromJSDate(pivot.expires_at) < DateTime.now()) {
        continue
      }
      permissions.add(permission.name)
    }

    return Array.from(permissions)
  }

  /**
   * Check if user has a specific permission
   */
  async userHasPermission(userId: number, permissionName: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId)

    // Check exact match
    if (permissions.includes(permissionName)) return true

    // Check wildcard permissions
    const permissionParts = permissionName.split('.')
    if (permissionParts.length > 1) {
      const wildcardPermission = `${permissionParts[0]}.*`
      return permissions.includes(wildcardPermission)
    }

    return false
  }

  /**
   * Check if user has a specific role
   */
  async userHasRole(userId: number, roleName: string): Promise<boolean> {
    const userRole = await UserRole.query()
      .where('user_id', userId)
      .whereHas('role', (query) => {
        query.where('name', roleName).where('is_active', true)
      })
      .where((query) => {
        query.whereNull('expires_at').orWhere('expires_at', '>', DateTime.now().toSQL())
      })
      .first()

    return !!userRole
  }

  /**
   * Assign role to user
   */
  async assignRoleToUser(
    userId: number,
    roleId: number,
    assignedBy: number,
    expiresAt?: DateTime
  ): Promise<UserRole> {
    // Remove existing assignment if any
    await UserRole.query().where('user_id', userId).where('role_id', roleId).delete()

    // Create new assignment
    return await UserRole.create({
      userId,
      roleId,
      assigned_by: assignedBy,
      assigned_at: DateTime.now(),
      expires_at: expiresAt,
    })
  }

  /**
   * Remove role from user
   */
  async removeRoleFromUser(userId: number, roleId: number): Promise<void> {
    await UserRole.query().where('user_id', userId).where('role_id', roleId).delete()
  }

  /**
   * Grant direct permission to user
   */
  async grantPermissionToUser(
    userId: number,
    permissionId: number,
    grantedBy: number,
    expiresAt?: DateTime
  ): Promise<UserPermission> {
    // Remove existing grant if any
    await UserPermission.query()
      .where('user_id', userId)
      .where('permission_id', permissionId)
      .delete()

    // Create new grant
    return await UserPermission.create({
      userId,
      permissionId,
      grantedBy,
      grantedAt: DateTime.now(),
      expiresAt,
    })
  }

  /**
   * Revoke direct permission from user
   */
  async revokePermissionFromUser(userId: number, permissionId: number): Promise<void> {
    await UserPermission.query()
      .where('user_id', userId)
      .where('permission_id', permissionId)
      .delete()
  }

  /**
   * Sync permissions for a role
   */
  async syncRolePermissions(roleId: number, permissionIds: number[]): Promise<void> {
    const role = await Role.find(roleId)
    if (!role) throw new Error('Role not found')

    await role.related('permissions').sync(permissionIds)
  }

  /**
   * Get users with a specific permission
   */
  async getUsersWithPermission(permissionName: string): Promise<User[]> {
    const permission = await Permission.findBy('name', permissionName)
    if (!permission) return []

    // Get users with direct permission
    const usersWithDirectPermission = await User.query().whereHas('permissions', (query) => {
      query.where('permissions.id', permission.id).where((subQuery) => {
        subQuery
          .whereNull('user_permissions.expires_at')
          .orWhere('user_permissions.expires_at', '>', DateTime.now().toSQL())
      })
    })

    // Get users with permission through role
    const usersWithRolePermission = await User.query().whereHas('roles', (query) => {
      query
        .whereHas('permissions', (permQuery) => {
          permQuery.where('permissions.id', permission.id)
        })
        .where('roles.is_active', true)
        .where((subQuery) => {
          subQuery
            .whereNull('user_roles.expires_at')
            .orWhere('user_roles.expires_at', '>', DateTime.now().toSQL())
        })
    })

    // Merge and deduplicate users
    const userMap = new Map<number, User>()

    usersWithDirectPermission.forEach((user: User) => {
      userMap.set(user.id, user)
    })

    usersWithRolePermission.forEach((user: User) => {
      userMap.set(user.id, user)
    })

    return Array.from(userMap.values())
  }

  /**
   * Clean up expired assignments
   */
  async cleanupExpiredAssignments(): Promise<void> {
    const now = DateTime.now().toSQL()

    // Remove expired role assignments
    await UserRole.query().whereNotNull('expires_at').where('expires_at', '<', now).delete()

    // Remove expired permission grants
    await UserPermission.query().whereNotNull('expires_at').where('expires_at', '<', now).delete()
  }

  /**
   * Get role hierarchy (if implemented)
   */
  async getRoleHierarchy(roleName: string): Promise<string[]> {
    // This is a placeholder for role hierarchy logic
    // You can implement parent-child relationships between roles
    // For now, return only the role itself
    return [roleName]
  }
}
