import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import AuthService from '#services/auth_service'
import PasswordService from '#services/password_service'
import { inject } from '@adonisjs/core'

export default class CleanupExpiredData extends BaseCommand {
  static commandName = 'cleanup:expired'
  static description = 'Clean up expired MFA sessions, tokens, and password reset codes'

  static options: CommandOptions = {
    startApp: true,
  }

  @inject()
  async run(authService: AuthService, passwordService: PasswordService) {
    this.logger.info('Starting cleanup of expired data...')

    try {
      // Clean expired MFA sessions and user tokens
      await authService.cleanExpiredSessions()
      this.logger.success('✓ Cleaned expired MFA sessions and user tokens')

      // Clean expired password reset tokens
      await passwordService.cleanExpiredTokens()
      this.logger.success('✓ Cleaned expired password reset tokens')

      this.logger.info('Cleanup completed successfully!')
    } catch (error) {
      this.logger.error('Cleanup failed:', error)
      this.exitCode = 1
    }
  }
}
