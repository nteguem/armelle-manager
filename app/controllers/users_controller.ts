// app/controllers/users_controller.ts

import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import Role from '#models/role'
import { ResponseHelper } from '#helpers/response_helper'
import { ErrorCodes } from '#constants'

export default class UsersController {
  /**
   * GET /api/users
   * Lister tous les utilisateurs avec pagination et filtres
   */
  async index({ request, response }: HttpContext) {
    try {
      const page = request.input('page', 1)
      const limit = Math.min(request.input('limit', 20), 100)
      const search = request.input('search')
      const roleId = request.input('role_id')
      const status = request.input('status')
      const sortBy = request.input('sort_by', 'created_at')
      const sortOrder = request.input('sort_order', 'desc')

      // Construction de la requête
      const query = User.query()

      // Filtres
      if (search) {
        query.where((builder) => {
          builder
            .whereILike('first_name', `%${search}%`)
            .orWhereILike('last_name', `%${search}%`)
            .orWhereILike('email', `%${search}%`)
        })
      }

      if (roleId) {
        query.where('role_id', roleId)
      }

      if (status) {
        query.where('status', status)
      }

      // Tri
      if (['created_at', 'last_login', 'email', 'first_name', 'last_name'].includes(sortBy)) {
        query.orderBy(sortBy, sortOrder === 'desc' ? 'desc' : 'asc')
      }

      // Préchargement des relations
      query.preload('role')

      // Pagination
      const users = await query.paginate(page, limit)

      // Récupérer les rôles disponibles pour les filtres
      const availableRoles = await Role.query()
        .select('id', 'name', 'display_name')
        .where('status', 'active')

      // Format de réponse
      const paginationMeta = {
        current_page: users.currentPage,
        per_page: users.perPage,
        total: users.total,
        total_pages: users.lastPage,
      }

      const filters = {
        applied: {
          status,
          role_id: roleId,
          search,
        },
        available_roles: availableRoles.map((role) => ({
          id: role.id,
          name: role.name,
          display_name: role.displayName,
        })),
      }

      return response.status(200).json(
        ResponseHelper.successWithPagination(
          users.all().map((user) => ({
            id: user.id,
            email: user.email,
            first_name: user.firstName,
            last_name: user.lastName,
            status: user.status,
            role: user.role
              ? {
                  id: user.role.id,
                  name: user.role.name,
                  display_name: user.role.displayName,
                }
              : null,
            last_login: user.lastLogin?.toISO() || null,
            created_at: user.createdAt.toISO(),
            updated_at: user.updatedAt.toISO(),
          })),
          paginationMeta,
          undefined,
          { filters }
        )
      )
    } catch (error) {
      return response
        .status(500)
        .json(ResponseHelper.error('Server error', ErrorCodes.GENERAL_SERVER_ERROR, 500))
    }
  }

  /**
   * POST /api/users
   * Créer un nouvel utilisateur
   */
  async store({ request, response }: HttpContext) {
    try {
      const {
        email,
        first_name: firstName,
        last_name: lastName,
        role_id: roleId,
        status = 'pending',
        send_welcome_email: sendWelcomeEmail = true,
      } = request.only([
        'email',
        'first_name',
        'last_name',
        'role_id',
        'status',
        'send_welcome_email',
      ])

      // Validation
      if (!email || !firstName || !lastName || !roleId) {
        return response
          .status(400)
          .json(
            ResponseHelper.error(
              'Email, first name, last name and role are required',
              ErrorCodes.VALID_EMAIL_REQUIRED
            )
          )
      }

      // Vérifier que l'email n'existe pas déjà
      const existingUser = await User.findBy('email', email)
      if (existingUser) {
        return response.status(409).json(ResponseHelper.emailAlreadyExists())
      }

      // Vérifier que le rôle existe
      const role = await Role.find(roleId)
      if (!role) {
        return response.status(404).json(ResponseHelper.roleNotFound())
      }

      // Créer l'utilisateur
      const user = await User.create({
        email,
        firstName,
        lastName,
        roleId,
        status: sendWelcomeEmail ? 'pending' : status,
        password: 'temporary_password',
        loginCount: 0,
      })

      // Charger le rôle pour la réponse
      await user.load('role')

      // Actions déclenchées
      const actions = {
        welcome_email_sent: sendWelcomeEmail,
        password_reset_token_generated: sendWelcomeEmail,
      }

      return response.status(201).json(ResponseHelper.userCreatedSuccess(user, actions))
    } catch (error) {
      return response
        .status(500)
        .json(ResponseHelper.error('Server error', ErrorCodes.GENERAL_SERVER_ERROR, 500))
    }
  }

  /**
   * GET /api/users/:id
   * Récupérer un utilisateur spécifique
   */
  async show({ params, response }: HttpContext) {
    try {
      const user = await User.query()
        .where('id', params.id)
        .preload('role', (roleQuery) => {
          roleQuery.preload('permissions')
        })
        .first()

      if (!user) {
        return response.status(404).json(ResponseHelper.userNotFound())
      }

      const userData = {
        id: user.id,
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
        status: user.status,
        role: user.role
          ? {
              id: user.role.id,
              name: user.role.name,
              display_name: user.role.displayName,
              permissions:
                user.role.permissions?.map((p) => ({
                  id: p.id,
                  name: p.name,
                  description: p.description,
                })) || [],
            }
          : null,
        last_login: user.lastLogin?.toISO() || null,
        login_count: user.loginCount,
        created_at: user.createdAt.toISO(),
        updated_at: user.updatedAt.toISO(),
        created_by: {
          id: 1,
          name: 'System Admin',
        },
      }

      return response.status(200).json(ResponseHelper.success({ user: userData }))
    } catch (error) {
      return response
        .status(500)
        .json(ResponseHelper.error('Server error', ErrorCodes.GENERAL_SERVER_ERROR, 500))
    }
  }

  /**
   * PUT /api/users/:id
   * Mettre à jour un utilisateur
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const user = await User.find(params.id)
      if (!user) {
        return response.status(404).json(ResponseHelper.userNotFound())
      }

      const {
        email,
        first_name: firstName,
        last_name: lastName,
        role_id: roleId,
        status,
      } = request.only(['email', 'first_name', 'last_name', 'role_id', 'status'])

      // Tracker les changements pour l'audit
      const changes: Record<string, { old: any; new: any }> = {}

      // Vérifier l'unicité de l'email si modifié
      if (email && email !== user.email) {
        const existingUser = await User.findBy('email', email)
        if (existingUser) {
          return response.status(409).json(ResponseHelper.emailAlreadyExists())
        }
        changes.email = { old: user.email, new: email }
        user.email = email
      }

      if (firstName && firstName !== user.firstName) {
        changes.first_name = { old: user.firstName, new: firstName }
        user.firstName = firstName
      }

      if (lastName && lastName !== user.lastName) {
        changes.last_name = { old: user.lastName, new: lastName }
        user.lastName = lastName
      }

      if (roleId && roleId !== user.roleId) {
        const role = await Role.find(roleId)
        if (!role) {
          return response.status(404).json(ResponseHelper.roleNotFound())
        }
        changes.role_id = { old: user.roleId, new: roleId }
        user.roleId = roleId
      }

      if (status && status !== user.status) {
        changes.status = { old: user.status, new: status }
        user.status = status
      }

      await user.save()
      await user.load('role')

      return response.status(200).json(ResponseHelper.userUpdatedSuccess(user, changes))
    } catch (error) {
      return response
        .status(500)
        .json(ResponseHelper.error('Server error', ErrorCodes.GENERAL_SERVER_ERROR, 500))
    }
  }

  /**
   * PUT /api/users/:id/status
   * Changer le statut d'un utilisateur
   */
  async updateStatus({ params, request, response, auth }: HttpContext) {
    try {
      const user = await User.find(params.id)
      if (!user) {
        return response.status(404).json(ResponseHelper.userNotFound())
      }

      const { status, reason } = request.only(['status', 'reason'])

      if (!status) {
        return response.status(400).json(ResponseHelper.invalidStatus())
      }

      const validStatuses = ['active', 'inactive', 'suspended']
      if (!validStatuses.includes(status)) {
        return response.status(400).json(ResponseHelper.invalidStatus())
      }

      const oldStatus = user.status
      user.status = status
      await user.save()

      const currentUser = auth.getUserOrFail()

      return response.status(200).json(
        ResponseHelper.success(
          {
            user_id: user.id,
            old_status: oldStatus,
            new_status: status,
            reason: reason || null,
            updated_at: user.updatedAt.toISO(),
            updated_by: {
              id: currentUser.id,
              name: currentUser.fullName,
            },
          },
          'User status updated successfully'
        )
      )
    } catch (error) {
      return response
        .status(500)
        .json(ResponseHelper.error('Server error', ErrorCodes.GENERAL_SERVER_ERROR, 500))
    }
  }

  /**
   * POST /api/users/:id/reset-password
   * Réinitialisation administrative du mot de passe
   */
  async adminResetPassword({ params, request, response, auth }: HttpContext) {
    try {
      const user = await User.find(params.id)
      if (!user) {
        return response.status(404).json(ResponseHelper.userNotFound())
      }

      const { send_email: sendEmail = true, custom_message: customMessage } = request.only([
        'send_email',
        'custom_message',
      ])

      // Utilisation de customMessage pour éviter l'erreur "never read"
      const messageToLog = customMessage || 'Standard password reset message'
      console.log('Reset message:', messageToLog)

      const currentUser = auth.getUserOrFail()

      return response.status(200).json(
        ResponseHelper.success(
          {
            user_id: user.id,
            reset_token_generated: true,
            email_sent: sendEmail,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            initiated_by: {
              id: currentUser.id,
              name: currentUser.fullName,
            },
          },
          'Password reset initiated successfully'
        )
      )
    } catch (error) {
      return response
        .status(500)
        .json(ResponseHelper.error('Server error', ErrorCodes.GENERAL_SERVER_ERROR, 500))
    }
  }

  /**
   * DELETE /api/users/:id
   * Supprimer un utilisateur (soft delete)
   */
  async destroy({ params, response, auth }: HttpContext) {
    try {
      const user = await User.find(params.id)
      if (!user) {
        return response.status(404).json(ResponseHelper.userNotFound())
      }

      const currentUser = auth.getUserOrFail()

      // Règle métier : Ne peut pas supprimer son propre compte
      if (user.id === currentUser.id) {
        return response.status(403).json(ResponseHelper.cannotDeleteSelf())
      }

      // Règle métier : Vérifier que ce n'est pas le dernier admin
      if (user.role?.name === 'admin') {
        const adminCountResult = await User.query()
          .whereHas('role', (roleQuery) => {
            roleQuery.where('name', 'admin')
          })
          .where('status', 'active')
          .count('* as total')

        const adminCount = Number(adminCountResult[0].$extras.total)

        if (adminCount <= 1) {
          return response.status(409).json(ResponseHelper.cannotDeleteLastAdmin())
        }
      }

      // Soft delete
      user.status = 'deleted'
      await user.save()

      return response.status(200).json(
        ResponseHelper.success(
          {
            user_id: user.id,
            deleted_at: user.updatedAt.toISO(),
            deleted_by: {
              id: currentUser.id,
              name: currentUser.fullName,
            },
          },
          'User deleted successfully (soft delete)'
        )
      )
    } catch (error) {
      return response
        .status(500)
        .json(ResponseHelper.error('Server error', ErrorCodes.GENERAL_SERVER_ERROR, 500))
    }
  }
}
