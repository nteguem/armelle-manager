import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import User from '#models/user'
import { ResponseHelper } from '#helpers/response_helper'
import { ErrorCodes } from '#constants'

export default class AuthController {
  /**
   * POST /api/auth/login
   * Authentification utilisateur
   */
  async login({ request, response }: HttpContext) {
    try {
      const {
        email,
        password,
        remember_me: rememberMe = false,
      } = request.only(['email', 'password', 'remember_me'])

      // Validation basique
      if (!email || !password) {
        return response
          .status(400)
          .json(
            ResponseHelper.error('Email and password are required', ErrorCodes.VALID_EMAIL_REQUIRED)
          )
      }

      // Vérifier les credentials avec User.verifyCredentials
      const user = await User.verifyCredentials(email, password)

      // Charger le rôle et permissions
      await user.load('role', (roleQuery) => {
        roleQuery.preload('permissions')
      })

      // Vérifier le statut de l'utilisateur
      if (user.status !== 'active') {
        if (user.status === 'pending') {
          return response.status(401).json(ResponseHelper.authAccountInactive())
        }
        if (user.status === 'suspended' || user.status === 'inactive') {
          return response.status(423).json(ResponseHelper.authAccountLocked())
        }
      }

      // Créer le token d'accès
      const token = await User.accessTokens.create(user, ['*'], {
        expiresIn: rememberMe ? '7 days' : '1 hour',
      })

      // Mettre à jour last_login et login_count
      user.lastLogin = DateTime.now()
      user.loginCount = (user.loginCount || 0) + 1
      await user.save()

      // Réponse conforme
      return response
        .status(200)
        .json(ResponseHelper.loginSuccess(token.value!.release(), user, rememberMe))
    } catch (error) {
      // Erreur d'authentification
      return response.status(401).json(ResponseHelper.authInvalidCredentials())
    }
  }

  /**
   * POST /api/auth/logout
   * Déconnexion utilisateur
   */
  async logout({ auth, response }: HttpContext) {
    try {
      const user = auth.getUserOrFail()
      const token = auth.user?.currentAccessToken

      if (token) {
        await User.accessTokens.delete(user, token.identifier)
      }

      return response.status(200).json(ResponseHelper.logoutSuccess())
    } catch (error) {
      return response.status(401).json(ResponseHelper.authTokenInvalid())
    }
  }

  /**
   * GET /api/auth/me
   * Profil de l'utilisateur connecté
   */
  async me({ auth, response }: HttpContext) {
    try {
      const user = auth.getUserOrFail()

      // Charger le rôle et permissions
      await user.load('role', (roleQuery) => {
        roleQuery.preload('permissions')
      })

      return response.status(200).json(ResponseHelper.userProfileSuccess(user))
    } catch (error) {
      return response.status(401).json(ResponseHelper.authTokenInvalid())
    }
  }

  /**
   * POST /api/auth/forgot-password
   * Demande de réinitialisation
   */
  async forgotPassword({ request, response }: HttpContext) {
    try {
      const { email } = request.only(['email'])

      if (!email) {
        return response.status(400).json(ResponseHelper.emailRequired())
      }

      // Vérifier si l'utilisateur existe (mais ne pas révéler s'il existe ou non)
      let emailSent = false
      try {
        const user = await User.findByOrFail('email', email)

        if (user.status === 'active' || user.status === 'suspended') {
          // Générer un token de reset (à implémenter avec un modèle PasswordReset)
          // TODO: Créer le token et envoyer l'email
          emailSent = true
        }
      } catch (error) {
        // Utilisateur non trouvé, mais on ne révèle pas cette info
      }

      // Toujours retourner 200 pour éviter l'énumération d'emails
      return response.status(200).json(ResponseHelper.forgotPasswordSuccess(emailSent))
    } catch (error) {
      return response
        .status(500)
        .json(ResponseHelper.error('Server error', ErrorCodes.GENERAL_SERVER_ERROR, 500))
    }
  }

  /**
   * POST /api/auth/reset-password
   * Réinitialisation du mot de passe
   */
  async resetPassword({ request, response }: HttpContext) {
    try {
      const {
        token,
        email,
        new_password: newPassword,
        confirm_password: confirmPassword,
      } = request.only(['token', 'email', 'new_password', 'confirm_password'])

      // Validation basique
      if (!token || !email || !newPassword || !confirmPassword) {
        return response
          .status(400)
          .json(ResponseHelper.error('All fields are required', ErrorCodes.VALID_EMAIL_REQUIRED))
      }

      if (newPassword !== confirmPassword) {
        return response
          .status(400)
          .json(ResponseHelper.error('Passwords do not match', 'VALID_PASSWORD_MISMATCH'))
      }

      // TODO: Vérifier le token de reset et mettre à jour le mot de passe
      // Pour l'instant, simulons le succès

      const user = await User.findByOrFail('email', email)
      user.password = newPassword
      await user.save()

      return response.status(200).json(ResponseHelper.resetPasswordSuccess(user.id))
    } catch (error) {
      return response
        .status(400)
        .json(ResponseHelper.error('Invalid or expired token', ErrorCodes.AUTH_TOKEN_INVALID))
    }
  }

  /**
   * POST /api/auth/verify-email
   * Vérification email
   */
  async verifyEmail({ request, response }: HttpContext) {
    try {
      const {
        token,
        email,
        password,
        confirm_password: confirmPassword,
      } = request.only(['token', 'email', 'password', 'confirm_password'])

      if (!token || !email) {
        return response
          .status(400)
          .json(
            ResponseHelper.error('Token and email are required', ErrorCodes.VALID_EMAIL_REQUIRED)
          )
      }

      const user = await User.findByOrFail('email', email)

      // Si l'utilisateur est pending et doit définir son mot de passe
      if (user.status === 'pending' && password) {
        if (!confirmPassword || password !== confirmPassword) {
          return response
            .status(400)
            .json(ResponseHelper.error('Passwords do not match', 'VALID_PASSWORD_MISMATCH'))
        }

        user.password = password
      }

      // Activer le compte
      user.status = 'active'
      await user.save()

      return response.status(200).json(ResponseHelper.verifyEmailSuccess(user.id))
    } catch (error) {
      return response
        .status(400)
        .json(ResponseHelper.error('Invalid or expired token', ErrorCodes.AUTH_TOKEN_INVALID))
    }
  }
}
