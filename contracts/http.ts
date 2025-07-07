/**
 * Contract for extending HTTP context
 */
import User from '#models/user'

declare module '@adonisjs/core/http' {
  interface HttpContext {
    /**
     * Current authenticated user from Nellys Coin
     */
    user?: User

    /**
     * Helper to check if user can access panel
     */
    canAccessPanel?: () => boolean
  }
}
