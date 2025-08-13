import { DateTime } from 'luxon'
import { randomUUID } from 'node:crypto'

export interface ApiResponse<T = any> {
  status: 'success' | 'error'
  message?: string
  code?: string
  data?: T
  meta?: {
    timestamp: string
    request_id?: string
    pagination?: {
      current_page: number
      total_pages: number
      per_page: number
      total_items: number
    }
  }
}

export interface ValidationError {
  [field: string]: string[]
}

export enum ErrorCodes {
  // Authentication
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_MISSING = 'AUTH_TOKEN_MISSING',
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_INVALID_MFA = 'AUTH_INVALID_MFA',
  AUTH_MFA_SESSION_INVALID = 'AUTH_MFA_SESSION_INVALID',
  AUTH_MFA_REQUIRED = 'AUTH_MFA_REQUIRED',
  AUTH_ERROR = 'AUTH_ERROR',

  // Authorization
  AUTHZ_INSUFFICIENT_PERMISSIONS = 'AUTHZ_INSUFFICIENT_PERMISSIONS',
  AUTHZ_PANEL_ACCESS_DENIED = 'AUTHZ_PANEL_ACCESS_DENIED',

  // Password Reset
  RESET_INVALID_CODE = 'RESET_INVALID_CODE',
  RESET_CODE_EXPIRED = 'RESET_CODE_EXPIRED',
  RESET_USER_NOT_FOUND = 'RESET_USER_NOT_FOUND',
  RESET_INITIATE_ERROR = 'RESET_INITIATE_ERROR',
  RESET_FAILED = 'RESET_FAILED',

  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  // Rate Limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Server Errors
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // Business Logic
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
  OPERATION_NOT_ALLOWED = 'OPERATION_NOT_ALLOWED',
}

export default class ResponseFormatter {
  /**
   * Generate request ID
   */
  private static generateRequestId(): string {
    return `req_${randomUUID().replace(/-/g, '').substring(0, 12)}`
  }

  /**
   * Get current timestamp
   */
  private static getTimestamp(): string {
    return DateTime.now().toISO()
  }

  /**
   * Format success response
   */
  static success<T = any>(data?: T, message?: string, requestId?: string): ApiResponse<T> {
    const response: ApiResponse<T> = {
      status: 'success',
      meta: {
        timestamp: this.getTimestamp(),
        request_id: requestId || this.generateRequestId(),
      },
    }

    if (message) {
      response.message = message
    }

    if (data !== undefined) {
      response.data = data
    }

    return response
  }

  /**
   * Format error response
   */
  static error(
    message: string,
    code: string = ErrorCodes.INTERNAL_SERVER_ERROR,
    data?: any,
    requestId?: string
  ): ApiResponse {
    return {
      status: 'error',
      message,
      code,
      ...(data !== undefined && { data }),
      meta: {
        timestamp: this.getTimestamp(),
        request_id: requestId || this.generateRequestId(),
      },
    }
  }

  /**
   * Format validation error response
   */
  static validationError(
    errors: ValidationError,
    message: string = 'Validation failed',
    requestId?: string
  ): ApiResponse<{ errors: ValidationError }> {
    return {
      status: 'error',
      message,
      code: ErrorCodes.VALIDATION_ERROR,
      data: { errors },
      meta: {
        timestamp: this.getTimestamp(),
        request_id: requestId || this.generateRequestId(),
      },
    }
  }

  /**
   * Format paginated response
   */
  static paginated<T = any>(
    data: T[],
    pagination: {
      current_page: number
      total_pages: number
      per_page: number
      total_items: number
    },
    message?: string,
    requestId?: string
  ): ApiResponse<T[]> {
    return {
      status: 'success',
      ...(message && { message }),
      data,
      meta: {
        timestamp: this.getTimestamp(),
        request_id: requestId || this.generateRequestId(),
        pagination,
      },
    }
  }

  /**
   * Format auth success response
   */
  static authSuccess(
    token: string,
    refreshToken: string | null,
    expiresIn: string | number,
    user: any,
    requestId?: string,
    dataAccessToken?: string
  ): ApiResponse {
    return this.success(
      {
        access_token: token,
        token_type: 'Bearer',
        expires_in: typeof expiresIn === 'string' ? Number.parseInt(expiresIn) : expiresIn,
        ...(refreshToken && { refresh_token: refreshToken }),
        user,
        ...(dataAccessToken && { data_access_token: dataAccessToken }),
      },
      undefined,
      requestId
    )
  }

  /**
   * Extract request ID from headers
   */
  static extractRequestId(headers: any): string | undefined {
    return headers['x-request-id'] || headers['request-id']
  }
}
