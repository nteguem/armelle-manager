import { ErrorCodes, ResponseStatus, TokenConstants, HttpStatus } from '#constants'

export interface SuccessResponse<T = any> {
  status: 'success'
  message?: string
  data: T
  timestamp?: string
}

export interface ErrorResponse {
  status: 'error'
  message: string
  code: string
  details?: any
  timestamp?: string
}

export interface PaginationMeta {
  current_page: number
  per_page: number
  total: number
  total_pages: number
}

export interface LoginSuccessData {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  user: {
    id: number
    email: string
    first_name: string
    last_name: string
    role: {
      id: number
      name: string
      display_name: string
      permissions: string[]
    }
    last_login: string | null
  }
}

export interface UserListData {
  users: any[]
  pagination: PaginationMeta
  filters?: {
    applied: Record<string, any>
    available_roles: Array<{ id: number; name: string; display_name: string }>
  }
}

export interface RoleListData {
  roles: any[]
  pagination: PaginationMeta
}

export interface PermissionListData {
  permissions: Record<string, any[]>
  total: number
}

export class ResponseHelper {
  /**
   * Réponse de succès standard
   */
  static success<T>(data: T, message?: string): SuccessResponse<T> {
    return {
      status: ResponseStatus.SUCCESS,
      message,
      data,
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Réponse de succès avec pagination
   */
  static successWithPagination<T>(
    items: T[],
    pagination: PaginationMeta,
    message?: string,
    additionalData?: Record<string, any>
  ): SuccessResponse<{ items: T[]; pagination: PaginationMeta } & Record<string, any>> {
    return {
      status: ResponseStatus.SUCCESS,
      message,
      data: {
        items,
        pagination,
        ...additionalData,
      },
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Réponse de login réussie
   */
  static loginSuccess(
    token: string,
    user: any,
    rememberMe: boolean = false
  ): SuccessResponse<LoginSuccessData> {
    const expiresIn = rememberMe
      ? TokenConstants.REMEMBER_ME_EXPIRES_IN
      : TokenConstants.DEFAULT_EXPIRES_IN

    return {
      status: ResponseStatus.SUCCESS,
      data: {
        access_token: token,
        token_type: TokenConstants.TYPE,
        expires_in: expiresIn,
        user: {
          id: user.id,
          email: user.email,
          first_name: user.firstName,
          last_name: user.lastName,
          role: {
            id: user.role?.id || null,
            name: user.role?.name || null,
            display_name: user.role?.displayName || null,
            permissions: user.role?.permissions?.map((p: any) => p.name) || [],
          },
          last_login: user.lastLogin?.toISO() || null,
        },
      },
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Réponse de logout
   */
  static logoutSuccess(): SuccessResponse<null> {
    return {
      status: ResponseStatus.SUCCESS,
      message: 'Successfully logged out',
      data: null,
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Réponse pour /api/auth/me
   */
  static userProfileSuccess(user: any): SuccessResponse<{ user: any }> {
    return {
      status: ResponseStatus.SUCCESS,
      data: {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.firstName,
          last_name: user.lastName,
          status: user.status,
          role: {
            id: user.role?.id,
            name: user.role?.name,
            display_name: user.role?.displayName,
            permissions: user.role?.permissions?.map((p: any) => p.name) || [],
          },
          last_login: user.lastLogin?.toISO() || null,
          preferences: {
            language: 'fr',
            timezone: 'Europe/Paris',
            notifications: {
              email: true,
              browser: false,
            },
          },
        },
      },
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Réponse de création d'utilisateur
   */
  static userCreatedSuccess(user: any, actions: Record<string, boolean>): SuccessResponse<any> {
    return {
      status: ResponseStatus.SUCCESS,
      message: 'User created successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.firstName,
          last_name: user.lastName,
          status: user.status,
          role: {
            id: user.role?.id,
            name: user.role?.name,
            display_name: user.role?.displayName,
          },
          created_at: user.createdAt.toISO(),
          updated_at: user.updatedAt.toISO(),
        },
        actions,
      },
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Réponse de mise à jour d'utilisateur
   */
  static userUpdatedSuccess(user: any, changes?: Record<string, any>): SuccessResponse<any> {
    return {
      status: ResponseStatus.SUCCESS,
      message: 'User updated successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.firstName,
          last_name: user.lastName,
          status: user.status,
          role: {
            id: user.role?.id,
            name: user.role?.name,
            display_name: user.role?.displayName,
          },
          updated_at: user.updatedAt.toISO(),
        },
        changes,
      },
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Réponse d'erreur standard
   */
  static error(message: string, code: string, details?: any): ErrorResponse {
    return {
      status: ResponseStatus.ERROR,
      message,
      code,
      details,
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * ========================================
   * MÉTHODES D'ERREUR
   * ========================================
   */

  // Erreurs d'authentification
  static authInvalidCredentials() {
    return this.error(
      'Invalid email or password',
      ErrorCodes.AUTH_INVALID_CREDENTIALS,
      HttpStatus.UNAUTHORIZED
    )
  }

  static authAccountLocked() {
    return this.error(
      'Account locked due to too many failed login attempts',
      ErrorCodes.AUTH_ACCOUNT_LOCKED,
      HttpStatus.LOCKED
    )
  }

  static authAccountInactive() {
    return this.error(
      'Account is inactive or pending activation',
      ErrorCodes.AUTH_ACCOUNT_INACTIVE,
      HttpStatus.UNAUTHORIZED
    )
  }

  static authTokenExpired() {
    return this.error('Token has expired', ErrorCodes.AUTH_TOKEN_EXPIRED, HttpStatus.UNAUTHORIZED)
  }

  static authTokenInvalid() {
    return this.error(
      'Invalid or malformed token',
      ErrorCodes.AUTH_TOKEN_INVALID,
      HttpStatus.UNAUTHORIZED
    )
  }

  // Erreurs d'autorisation
  static insufficientPermissions() {
    return this.error(
      'Insufficient permissions to perform this action',
      ErrorCodes.PERM_INSUFFICIENT_PRIVILEGES,
      HttpStatus.FORBIDDEN
    )
  }

  static roleNotFound() {
    return this.error('Role not found', ErrorCodes.PERM_ROLE_NOT_FOUND, HttpStatus.NOT_FOUND)
  }

  static permissionDenied() {
    return this.error(
      'Permission denied for this operation',
      ErrorCodes.PERM_PERMISSION_DENIED,
      HttpStatus.FORBIDDEN
    )
  }

  // Erreurs de validation
  static emailRequired() {
    return this.error(
      'Email address is required',
      ErrorCodes.VALID_EMAIL_REQUIRED,
      HttpStatus.BAD_REQUEST
    )
  }

  static emailInvalid() {
    return this.error(
      'Email format is invalid',
      ErrorCodes.VALID_EMAIL_INVALID,
      HttpStatus.BAD_REQUEST
    )
  }

  static emailAlreadyExists() {
    return this.error(
      'Email address is already taken',
      ErrorCodes.VALID_EMAIL_EXISTS,
      HttpStatus.CONFLICT
    )
  }

  static passwordWeak() {
    return this.error(
      'Password does not meet security requirements',
      ErrorCodes.VALID_PASSWORD_WEAK,
      HttpStatus.BAD_REQUEST
    )
  }

  static roleRequired() {
    return this.error(
      'Role assignment is required',
      ErrorCodes.VALID_ROLE_REQUIRED,
      HttpStatus.BAD_REQUEST
    )
  }

  static invalidStatus() {
    return this.error(
      'Invalid status provided',
      ErrorCodes.VALID_INVALID_STATUS,
      HttpStatus.BAD_REQUEST
    )
  }

  // Erreurs de ressources
  static userNotFound() {
    return this.error('User not found', ErrorCodes.RESOURCE_USER_NOT_FOUND, HttpStatus.NOT_FOUND)
  }

  static resourceRoleNotFound() {
    return this.error('Role not found', ErrorCodes.RESOURCE_ROLE_NOT_FOUND, HttpStatus.NOT_FOUND)
  }

  static cannotDeleteLastAdmin() {
    return this.error(
      'Cannot delete the last active admin user',
      ErrorCodes.RESOURCE_CANNOT_DELETE_LAST_ADMIN,
      HttpStatus.FORBIDDEN
    )
  }

  static cannotDeleteSelf() {
    return this.error(
      'Cannot delete your own account',
      ErrorCodes.RESOURCE_CANNOT_DELETE_SELF,
      HttpStatus.FORBIDDEN
    )
  }

  static roleInUse() {
    return this.error(
      'Cannot delete role that is still assigned to users',
      ErrorCodes.RESOURCE_ROLE_IN_USE,
      HttpStatus.CONFLICT
    )
  }

  /**
   * Réponse de forgot password
   */
  static forgotPasswordSuccess(emailSent: boolean): SuccessResponse<any> {
    return {
      status: ResponseStatus.SUCCESS,
      message: 'If an account with that email exists, a password reset link has been sent.',
      data: {
        email_sent: emailSent,
      },
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Réponse de reset password
   */
  static resetPasswordSuccess(userId: number): SuccessResponse<any> {
    return {
      status: ResponseStatus.SUCCESS,
      message: 'Your password has been successfully reset.',
      data: {
        user_id: userId,
      },
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Réponse de verify email
   */
  static verifyEmailSuccess(userId: number): SuccessResponse<any> {
    return {
      status: ResponseStatus.SUCCESS,
      message: 'Email verified and account activated successfully.',
      data: {
        user_id: userId,
        status_changed_to: 'active',
      },
      timestamp: new Date().toISOString(),
    }
  }
}
