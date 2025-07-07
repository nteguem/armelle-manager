import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import ResponseFormatter, { ErrorCodes } from '#services/response_formatter'
import app from '@adonisjs/core/services/app'

export default class GlobalErrorHandlerMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    try {
      await next()

      // Handle 404 - route not found
      if (ctx.response.getStatus() === 404 && !ctx.response.hasLazyBody) {
        const requestId = ResponseFormatter.extractRequestId(ctx.request.headers())

        return ctx.response.status(404).send(
          ResponseFormatter.error(
            `Cannot ${ctx.request.method()}: ${ctx.request.url()}`,
            ErrorCodes.RESOURCE_NOT_FOUND,
            {
              method: ctx.request.method(),
              path: ctx.request.url(),
            },
            requestId
          )
        )
      }
    } catch (error: any) {
      const requestId = ResponseFormatter.extractRequestId(ctx.request.headers())

      // Handle validation errors
      if (error.code === 'E_VALIDATION_ERROR') {
        return ctx.response
          .status(422)
          .send(ResponseFormatter.validationError(error.messages, 'Validation failed', requestId))
      }

      // Handle authentication errors
      if (error.code === 'E_UNAUTHORIZED_ACCESS') {
        return ctx.response
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

      // Handle other known errors
      const statusCode = error.status || 500
      const message = app.inProduction
        ? 'An error occurred while processing your request'
        : error.message

      const errorCode = this.mapErrorCode(error.code) || ErrorCodes.INTERNAL_SERVER_ERROR

      return ctx.response
        .status(statusCode)
        .send(
          ResponseFormatter.error(
            message,
            errorCode,
            app.inDev ? { stack: error.stack } : undefined,
            requestId
          )
        )
    }
  }

  /**
   * Map framework error codes to our error codes
   */
  private mapErrorCode(code?: string): string | undefined {
    const mapping: Record<string, string> = {
      E_ROUTE_NOT_FOUND: ErrorCodes.RESOURCE_NOT_FOUND,
      E_VALIDATION_ERROR: ErrorCodes.VALIDATION_ERROR,
      E_UNAUTHORIZED_ACCESS: ErrorCodes.AUTH_TOKEN_INVALID,
      E_FORBIDDEN: ErrorCodes.AUTHZ_INSUFFICIENT_PERMISSIONS,
      E_RATE_LIMIT: ErrorCodes.RATE_LIMIT_EXCEEDED,
    }

    return code ? mapping[code] : undefined
  }
}
