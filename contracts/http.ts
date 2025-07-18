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
    userPermissions?: string[]
  }
}
