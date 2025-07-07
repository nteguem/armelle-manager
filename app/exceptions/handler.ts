import { HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import ResponseFormatter, { ErrorCodes } from '#services/response_formatter'
import app from '@adonisjs/core/services/app'

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * Status pages to render for specific error codes
   */
  protected statusPages = {
    '404': (error: any, ctx: HttpContext) => this.handleNotFound(error, ctx),
    '500..599': (error: any, ctx: HttpContext) => this.handleServerError(error, ctx),
  }

  /**
   * Handle 404 errors
   */
  private async handleNotFound(_error: any, { request, response }: HttpContext) {
    const requestId = ResponseFormatter.extractRequestId(request.headers())

    return response.status(404).send(
      ResponseFormatter.error(
        `Route not found: ${request.method()} ${request.url()}`,
        ErrorCodes.RESOURCE_NOT_FOUND,
        {
          method: request.method(),
          path: request.url(),
        },
        requestId
      )
    )
  }

  /**
   * Handle server errors
   */
  private async handleServerError(error: any, { request, response }: HttpContext) {
    const requestId = ResponseFormatter.extractRequestId(request.headers())

    return response
      .status(error.status || 500)
      .send(
        ResponseFormatter.error(
          app.inProduction ? 'Internal server error' : error.message,
          ErrorCodes.INTERNAL_SERVER_ERROR,
          app.inDev ? { stack: error.stack } : undefined,
          requestId
        )
      )
  }

  /**
   * Report exception for logging
   */
  async report(error: any, ctx: HttpContext) {
    // Don't log 404 errors
    if (error.status === 404) {
      return
    }

    // Don't log client errors (4xx) except 401 and 403
    if (error.status >= 400 && error.status < 500 && ![401, 403].includes(error.status)) {
      return
    }

    return super.report(error, ctx)
  }

  /**
   * Convert exception to response
   */
  async handle(error: any, ctx: HttpContext) {
    const { request, response } = ctx
    const requestId = ResponseFormatter.extractRequestId(request.headers())

    // Handle validation errors
    if (error.code === 'E_VALIDATION_ERROR') {
      return response
        .status(422)
        .send(ResponseFormatter.validationError(error.messages, 'Validation failed', requestId))
    }

    // Handle authentication errors
    if (error.code === 'E_UNAUTHORIZED_ACCESS' || error.status === 401) {
      return response
        .status(401)
        .send(
          ResponseFormatter.error(
            'Unauthorized access',
            ErrorCodes.AUTH_TOKEN_INVALID,
            undefined,
            requestId
          )
        )
    }

    // Handle forbidden errors
    if (error.code === 'E_FORBIDDEN' || error.status === 403) {
      return response
        .status(403)
        .send(
          ResponseFormatter.error(
            'Access forbidden',
            ErrorCodes.AUTHZ_INSUFFICIENT_PERMISSIONS,
            undefined,
            requestId
          )
        )
    }

    // Use parent handler for other cases
    return super.handle(error, ctx)
  }
}
