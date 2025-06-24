import type { HttpContext } from '@adonisjs/core/http'
import Role from '#models/role'
import Permission from '#models/permission'
import User from '#models/user'
import { ResponseHelper } from '#helpers/response_helper'
import { ErrorCodes } from '#constants'

export default class RolesController {
  /**
   * GET /api/roles
   * Lister tous les rôles
   */
  async index({ request, response }: HttpContext) {
    try {
      const page = request.input('page', 1)
      const limit = Math.min(request.input('limit', 20), 100)
      const search = request.input('search')
      const status = request.input('status')

      // Construction de la requête
      const query = Role.query()

      // Filtres
      if (search) {
        query.where((builder) => {
          builder.whereILike('name', `%${search}%`).orWhereILike('display_name', `%${search}%`)
        })
      }

      if (status) {
        query.where('status', status)
      }

      // Préchargement des relations
      query.preload('permissions')

      // Pagination
      const roles = await query.paginate(page, limit)

      // Compter les utilisateurs pour chaque rôle
      const rolesWithUserCount = await Promise.all(
        roles.all().map(async (role) => {
          const userCountResult = await User.query().where('role_id', role.id).count('* as total')

          const usersCount = Number(userCountResult[0].$extras.total)

          return {
            id: role.id,
            name: role.name,
            display_name: role.displayName,
            description: role.description,
            status: role.status,
            permissions: role.permissions.map((p) => ({
              id: p.id,
              name: p.name,
              description: p.description,
            })),
            users_count: usersCount,
            created_at: role.createdAt.toISO(),
            updated_at: role.updatedAt.toISO(),
          }
        })
      )

      // Format de réponse
      const paginationMeta = {
        current_page: roles.currentPage,
        per_page: roles.perPage,
        total: roles.total,
        total_pages: roles.lastPage,
      }

      return response
        .status(200)
        .json(ResponseHelper.successWithPagination(rolesWithUserCount, paginationMeta))
    } catch (error) {
      return response
        .status(500)
        .json(ResponseHelper.error('Server error', ErrorCodes.GENERAL_SERVER_ERROR, 500))
    }
  }

  /**
   * POST /api/roles
   * Créer un nouveau rôle
   */
  async store({ request, response }: HttpContext) {
    try {
      const {
        name,
        display_name: displayName,
        description,
        permission_ids: permissionIds,
        status = 'active',
      } = request.only(['name', 'display_name', 'description', 'permission_ids', 'status'])

      // Validation
      if (!name || !displayName) {
        return response
          .status(400)
          .json(
            ResponseHelper.error(
              'Name and display name are required',
              ErrorCodes.VALID_ROLE_REQUIRED
            )
          )
      }

      // Vérifier que le nom n'existe pas déjà
      const existingRole = await Role.findBy('name', name)
      if (existingRole) {
        return response
          .status(409)
          .json(ResponseHelper.error('Role name already exists', ErrorCodes.VALID_EMAIL_EXISTS))
      }

      // Vérifier que les permissions existent
      if (permissionIds && permissionIds.length > 0) {
        const permissions = await Permission.query().whereIn('id', permissionIds)
        if (permissions.length !== permissionIds.length) {
          return response
            .status(400)
            .json(
              ResponseHelper.error(
                'Some permissions do not exist',
                ErrorCodes.PERM_PERMISSION_DENIED
              )
            )
        }
      }

      // Créer le rôle
      const role = await Role.create({
        name,
        displayName,
        description,
        status,
      })

      // Attacher les permissions si fournies
      if (permissionIds && permissionIds.length > 0) {
        await role.related('permissions').attach(
          permissionIds.reduce((acc: Record<number, any>, id: number) => {
            acc[id] = {}
            return acc
          }, {})
        )
      }

      // Charger les permissions pour la réponse
      await role.load('permissions')

      const roleData = {
        id: role.id,
        name: role.name,
        display_name: role.displayName,
        description: role.description,
        status: role.status,
        permissions: role.permissions.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
        })),
        created_at: role.createdAt.toISO(),
        updated_at: role.updatedAt.toISO(),
      }

      return response
        .status(201)
        .json(ResponseHelper.success({ role: roleData }, 'Role created successfully'))
    } catch (error) {
      return response
        .status(500)
        .json(ResponseHelper.error('Server error', ErrorCodes.GENERAL_SERVER_ERROR, 500))
    }
  }

  /**
   * GET /api/roles/:id
   * Récupérer un rôle spécifique
   */
  async show({ params, response }: HttpContext) {
    try {
      const role = await Role.query().where('id', params.id).preload('permissions').first()

      if (!role) {
        return response.status(404).json(ResponseHelper.resourceRoleNotFound())
      }

      // Compter les utilisateurs
      const userCountResult = await User.query().where('role_id', role.id).count('* as total')

      const usersCount = Number(userCountResult[0].$extras.total)

      const roleData = {
        id: role.id,
        name: role.name,
        display_name: role.displayName,
        description: role.description,
        status: role.status,
        permissions: role.permissions.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
        })),
        users_count: usersCount,
        created_at: role.createdAt.toISO(),
        updated_at: role.updatedAt.toISO(),
      }

      return response.status(200).json(ResponseHelper.success({ role: roleData }))
    } catch (error) {
      return response
        .status(500)
        .json(ResponseHelper.error('Server error', ErrorCodes.GENERAL_SERVER_ERROR, 500))
    }
  }

  /**
   * PUT /api/roles/:id
   * Mettre à jour un rôle
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const role = await Role.find(params.id)
      if (!role) {
        return response.status(404).json(ResponseHelper.resourceRoleNotFound())
      }

      const {
        name,
        display_name: displayName,
        description,
        permission_ids: permissionIds,
        status,
      } = request.only(['name', 'display_name', 'description', 'permission_ids', 'status'])

      // Vérifier l'unicité du nom si modifié
      if (name && name !== role.name) {
        const existingRole = await Role.findBy('name', name)
        if (existingRole) {
          return response
            .status(409)
            .json(ResponseHelper.error('Role name already exists', ErrorCodes.VALID_EMAIL_EXISTS))
        }
        role.name = name
      }

      if (displayName) role.displayName = displayName
      if (description !== undefined) role.description = description
      if (status) role.status = status

      await role.save()

      // Mettre à jour les permissions si fournies
      if (permissionIds !== undefined) {
        if (permissionIds.length > 0) {
          // Vérifier que les permissions existent
          const permissions = await Permission.query().whereIn('id', permissionIds)
          if (permissions.length !== permissionIds.length) {
            return response
              .status(400)
              .json(
                ResponseHelper.error(
                  'Some permissions do not exist',
                  ErrorCodes.PERM_PERMISSION_DENIED
                )
              )
          }

          // Synchroniser les permissions
          await role.related('permissions').sync(
            permissionIds.reduce((acc: Record<number, any>, id: number) => {
              acc[id] = {}
              return acc
            }, {})
          )
        } else {
          // Détacher toutes les permissions
          await role.related('permissions').detach()
        }
      }

      // Charger les permissions pour la réponse
      await role.load('permissions')

      const roleData = {
        id: role.id,
        name: role.name,
        display_name: role.displayName,
        description: role.description,
        status: role.status,
        permissions: role.permissions.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
        })),
        updated_at: role.updatedAt.toISO(),
      }

      return response
        .status(200)
        .json(ResponseHelper.success({ role: roleData }, 'Role updated successfully'))
    } catch (error) {
      return response
        .status(500)
        .json(ResponseHelper.error('Server error', ErrorCodes.GENERAL_SERVER_ERROR, 500))
    }
  }

  /**
   * DELETE /api/roles/:id
   * Supprimer un rôle
   */
  async destroy({ params, response }: HttpContext) {
    try {
      const role = await Role.find(params.id)
      if (!role) {
        return response.status(404).json(ResponseHelper.resourceRoleNotFound())
      }

      // Vérifier que le rôle n'est pas un rôle système
      const systemRoles = ['admin', 'super_admin', 'user']
      if (systemRoles.includes(role.name)) {
        return response
          .status(403)
          .json(
            ResponseHelper.error('Cannot delete system role', ErrorCodes.PERM_PERMISSION_DENIED)
          )
      }

      // Vérifier qu'aucun utilisateur n'a ce rôle
      const userCountResult = await User.query()
        .where('role_id', role.id)
        .where('status', '!=', 'deleted')
        .count('* as total')

      const usersCount = Number(userCountResult[0].$extras.total)

      if (usersCount > 0) {
        return response.status(409).json(ResponseHelper.roleInUse())
      }

      // Détacher les permissions avant suppression
      await role.related('permissions').detach()

      // Supprimer le rôle
      await role.delete()

      return response.status(200).json(
        ResponseHelper.success(
          {
            role_id: role.id,
            deleted_at: new Date().toISOString(),
          },
          'Role deleted successfully'
        )
      )
    } catch (error) {
      return response
        .status(500)
        .json(ResponseHelper.error('Server error', ErrorCodes.GENERAL_SERVER_ERROR, 500))
    }
  }

  /**
   * GET /api/permissions
   * Lister toutes les permissions
   */
  async permissions({ request, response }: HttpContext) {
    try {
      const module = request.input('module')
      const groupBy = request.input('group_by', 'module')

      let query = Permission.query()

      // Filtre par module si spécifié
      if (module) {
        query = query.where('module', module)
      }

      const permissions = await query.orderBy('module').orderBy('name')

      // Grouper selon le paramètre group_by
      let groupedPermissions: Record<string, any[]> = {}

      if (groupBy === 'category') {
        permissions.forEach((permission) => {
          if (!groupedPermissions[permission.category]) {
            groupedPermissions[permission.category] = []
          }
          groupedPermissions[permission.category].push({
            id: permission.id,
            name: permission.name,
            description: permission.description,
            module: permission.module,
            category: permission.category,
          })
        })
      } else {
        // Group by module (default)
        permissions.forEach((permission) => {
          if (!groupedPermissions[permission.module]) {
            groupedPermissions[permission.module] = []
          }
          groupedPermissions[permission.module].push({
            id: permission.id,
            name: permission.name,
            description: permission.description,
            module: permission.module,
            category: permission.category,
          })
        })
      }

      return response.status(200).json(
        ResponseHelper.success({
          permissions: groupedPermissions,
          total: permissions.length,
        })
      )
    } catch (error) {
      return response
        .status(500)
        .json(ResponseHelper.error('Server error', ErrorCodes.GENERAL_SERVER_ERROR, 500))
    }
  }
}
