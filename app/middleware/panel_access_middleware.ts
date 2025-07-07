import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class PanelAccessMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const { response, user } = ctx

    // Check if user exists (should be set by auth middleware)
    if (!user) {
      return response.unauthorized({
        message: 'Authentication required',
        errorCode: 'AUTH_REQUIRED',
      })
    }

    // Check panel access permission
    if (!user.canAccessPanel) {
      return response.forbidden({
        message: 'Access to panel denied',
        errorCode: 'PANEL_ACCESS_DENIED',
      })
    }

    await next()
  }
}
