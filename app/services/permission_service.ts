import User from '#models/rest-api/user'
import Role from '#models/rest-api/role'
import Permission from '#models/rest-api/permission'
import UserRole from '#models/rest-api/user_role'
import UserPermission from '#models/rest-api/user_permission'
import { DateTime } from 'luxon'
import Database from '@adonisjs/lucid/services/db'

export default class PermissionService {
  /**
   * Get all permissions for a user (from roles and direct)
   */
  async getUserPermissions(userId: number): Promise<string[]> {
    try {
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
    } catch (error) {
      console.error('Error getting user permissions:', error)
      return []
    }
  }

  /**
   * Check if user has a specific permission
   */
  async userHasPermission(userId: number, permissionName: string): Promise<boolean> {
    try {
      const permissions = await this.getUserPermissions(userId)

      // Check exact match
      if (permissions.includes(permissionName)) return true

      // Check wildcard permissions
      const permissionParts = permissionName.split('.')
      if (permissionParts.length > 1) {
        const wildcardPermission = `${permissionParts[0]}.*`
        if (permissions.includes(wildcardPermission)) return true
      }

      return false
    } catch (error) {
      console.error('Error checking user permission:', error)
      return false // Fail-safe
    }
  }

  /**
   * Check if user has a specific role
   */
  async userHasRole(userId: number, roleName: string): Promise<boolean> {
    try {
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
    } catch (error) {
      console.error('Error checking user role:', error)
      return false
    }
  }

  /**
   * Get active roles for a user
   * NOUVELLE MÉTHODE - Manquait pour le modèle User
   */
  async getUserActiveRoles(userId: number): Promise<Role[]> {
    try {
      const user = await User.find(userId)
      if (!user) return []

      await user.load('roles' as any)
      const userRoles = (user as any).roles || []

      return userRoles.filter((role: Role) => {
        if (!role.isActive) return false

        const pivot = role.$extras.pivot
        if (pivot?.expires_at && DateTime.fromJSDate(pivot.expires_at) < DateTime.now()) {
          return false
        }

        return true
      })
    } catch (error) {
      console.error('Error getting user active roles:', error)
      return []
    }
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
    const trx = await Database.transaction()

    try {
      // Remove existing assignment if any
      await UserRole.query({ client: trx })
        .where('user_id', userId)
        .where('role_id', roleId)
        .delete()

      // Create new assignment
      const userRole = await UserRole.create(
        {
          userId,
          roleId,
          assignedBy: assignedBy,
          assignedAt: DateTime.now(),
          expiresAt: expiresAt,
        },
        { client: trx }
      )

      await trx.commit()
      return userRole
    } catch (error) {
      await trx.rollback()
      console.error('Error assigning role to user:', error)
      throw error
    }
  }

  /**
   * Remove role from user
   */
  async removeRoleFromUser(userId: number, roleId: number): Promise<void> {
    try {
      await UserRole.query().where('user_id', userId).where('role_id', roleId).delete()
    } catch (error) {
      console.error('Error removing role from user:', error)
      throw error
    }
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
    const trx = await Database.transaction()

    try {
      // Remove existing grant if any
      await UserPermission.query({ client: trx })
        .where('user_id', userId)
        .where('permission_id', permissionId)
        .delete()

      // Create new grant
      const userPermission = await UserPermission.create(
        {
          userId,
          permissionId,
          grantedBy,
          grantedAt: DateTime.now(),
          expiresAt,
        },
        { client: trx }
      )

      await trx.commit()
      return userPermission
    } catch (error) {
      await trx.rollback()
      console.error('Error granting permission to user:', error)
      throw error
    }
  }

  /**
   * Revoke direct permission from user
   */
  async revokePermissionFromUser(userId: number, permissionId: number): Promise<void> {
    try {
      await UserPermission.query()
        .where('user_id', userId)
        .where('permission_id', permissionId)
        .delete()
    } catch (error) {
      console.error('Error revoking permission from user:', error)
      throw error
    }
  }

  /**
   * Sync permissions for a role
   */
  async syncRolePermissions(roleId: number, permissionIds: number[]): Promise<void> {
    try {
      const role = await Role.find(roleId)
      if (!role) throw new Error('Role not found')

      await role.related('permissions').sync(permissionIds)
    } catch (error) {
      console.error('Error syncing role permissions:', error)
      throw error
    }
  }

  /**
   * Get users with a specific permission
   */
  async getUsersWithPermission(permissionName: string): Promise<User[]> {
    try {
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
    } catch (error) {
      console.error('Error getting users with permission:', error)
      return []
    }
  }

  /**
   * Clean up expired assignments
   */
  async cleanupExpiredAssignments(): Promise<{ rolesRemoved: number; permissionsRemoved: number }> {
    try {
      const now = DateTime.now().toSQL()

      // Remove expired role assignments
      const expiredRolesResult = await UserRole.query()
        .whereNotNull('expires_at')
        .where('expires_at', '<', now)
        .delete()

      // Remove expired permission grants
      const expiredPermissionsResult = await UserPermission.query()
        .whereNotNull('expires_at')
        .where('expires_at', '<', now)
        .delete()

      return {
        rolesRemoved: Array.isArray(expiredRolesResult)
          ? expiredRolesResult.length
          : expiredRolesResult,
        permissionsRemoved: Array.isArray(expiredPermissionsResult)
          ? expiredPermissionsResult.length
          : expiredPermissionsResult,
      }
    } catch (error) {
      console.error('Error cleaning up expired assignments:', error)
      throw error
    }
  }

  /**
   * Get role hierarchy (placeholder for future implementation)
   */
  async getRoleHierarchy(roleName: string): Promise<string[]> {
    // This is a placeholder for role hierarchy logic
    // You can implement parent-child relationships between roles
    // For now, return only the role itself
    return [roleName]
  }

  /**
   * Get user permissions summary (useful for debugging)
   * NOUVELLE MÉTHODE - Utile pour le debug
   */
  async getUserPermissionsSummary(userId: number): Promise<{
    user: { id: number; username: string | null; email: string | null } | null
    activeRoles: { id: number; name: string; permissions: string[] }[]
    directPermissions: string[]
    allPermissions: string[]
    totalPermissions: number
  }> {
    try {
      const user = await User.find(userId)
      if (!user) {
        return {
          user: null,
          activeRoles: [],
          directPermissions: [],
          allPermissions: [],
          totalPermissions: 0,
        }
      }

      const activeRoles = await this.getUserActiveRoles(userId)
      const allPermissions = await this.getUserPermissions(userId)

      // Load direct permissions
      await user.load('permissions' as any)
      const directPermissions = ((user as any).permissions || [])
        .filter((permission: any) => {
          const pivot = permission.$extras.pivot
          return !pivot?.expires_at || DateTime.fromJSDate(pivot.expires_at) > DateTime.now()
        })
        .map((permission: any) => permission.name)

      // Format active roles with their permissions
      const formattedRoles = []
      for (const role of activeRoles) {
        await role.load('permissions' as any)
        formattedRoles.push({
          id: role.id,
          name: role.name,
          permissions: ((role as any).permissions || []).map((p: any) => p.name),
        })
      }

      return {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
        activeRoles: formattedRoles,
        directPermissions,
        allPermissions,
        totalPermissions: allPermissions.length,
      }
    } catch (error) {
      console.error('Error getting user permissions summary:', error)
      throw error
    }
  }
}
