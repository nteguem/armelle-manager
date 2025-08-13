import ResponseFormatter, { ErrorCodes, ValidationError } from '#services/response_formatter'
import type { HttpContext } from '@adonisjs/core/http'

export default class BaseController {
  /**
   * Get request ID from context
   */
  protected getRequestId(ctx: HttpContext): string | undefined {
    return ResponseFormatter.extractRequestId(ctx.request.headers())
  }

  /**
   * Send success response
   */
  protected success(ctx: HttpContext, data?: any, message?: string) {
    const requestId = this.getRequestId(ctx)
    return ctx.response.ok(ResponseFormatter.success(data, message, requestId))
  }

  /**
   * Send error response
   */
  protected error(
    ctx: HttpContext,
    message: string,
    code: string = ErrorCodes.INTERNAL_SERVER_ERROR,
    statusCode: number = 400,
    data?: any
  ) {
    const requestId = this.getRequestId(ctx)
    return ctx.response
      .status(statusCode)
      .send(ResponseFormatter.error(message, code, data, requestId))
  }

  /**
   * Send validation error response
   */
  protected validationError(
    ctx: HttpContext,
    errors: ValidationError,
    message: string = 'Validation failed'
  ) {
    const requestId = this.getRequestId(ctx)
    return ctx.response.unprocessableEntity(
      ResponseFormatter.validationError(errors, message, requestId)
    )
  }

  /**
   * Send unauthorized error
   */
  protected unauthorized(
    ctx: HttpContext,
    message: string = 'Unauthorized',
    code: string = ErrorCodes.AUTH_TOKEN_INVALID
  ) {
    return this.error(ctx, message, code, 401)
  }

  /**
   * Send forbidden error
   */
  protected forbidden(
    ctx: HttpContext,
    message: string = 'Access denied',
    code: string = ErrorCodes.AUTHZ_INSUFFICIENT_PERMISSIONS
  ) {
    return this.error(ctx, message, code, 403)
  }

  /**
   * Send not found error
   */
  protected notFound(
    ctx: HttpContext,
    message: string = 'Resource not found',
    code: string = ErrorCodes.RESOURCE_NOT_FOUND
  ) {
    return this.error(ctx, message, code, 404)
  }

  /**
   * Send auth success response
   */
  protected authSuccess(
    ctx: HttpContext,
    token: string,
    refreshToken: string | null,
    expiresIn: string | number,
    user: any,
    dataAccessToken: string
  ) {
    const requestId = this.getRequestId(ctx)
    return ctx.response.ok(
      ResponseFormatter.authSuccess(token, refreshToken, expiresIn, user, requestId, dataAccessToken)
    )
  }

  /**
   * Send paginated response
   */
  protected paginated(
    ctx: HttpContext,
    data: any[],
    pagination: {
      current_page: number
      total_pages: number
      per_page: number
      total_items: number
    },
    message?: string
  ) {
    const requestId = this.getRequestId(ctx)
    return ctx.response.ok(ResponseFormatter.paginated(data, pagination, message, requestId))
  }

  /**
   * Handle Nellys Coin API errors
   */
  protected handleNellysCoinError(ctx: HttpContext, error: any) {
    // Map Nellys Coin error codes to our standard codes
    const errorMapping: Record<string, { code: string; status: number }> = {
      'AUTH_INVALID_CREDENTIALS': { code: ErrorCodes.AUTH_INVALID_CREDENTIALS, status: 401 },
      'AUTH_INVALID_MFA': { code: ErrorCodes.AUTH_INVALID_MFA, status: 400 },
      'Invalid verification code': { code: ErrorCodes.AUTH_INVALID_MFA, status: 400 },
      'Invalid credentials': { code: ErrorCodes.AUTH_INVALID_CREDENTIALS, status: 401 },
      'AUTH_ERROR': { code: ErrorCodes.AUTH_ERROR, status: 400 },
    }

    const message = error.message || 'An error occurred'
    const errorInfo = errorMapping[error.errorCode] ||
      errorMapping[message] || {
        code: ErrorCodes.INTERNAL_SERVER_ERROR,
        status: 500,
      }

    return this.error(ctx, message, errorInfo.code, errorInfo.status, error.data)
  }
}
