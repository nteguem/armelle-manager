import env from '#start/env'

const nellyCoinConfig = {
  /**
   * Base API URL for Nellys Coin
   */
  apiUrl: env.get('NELLYS_COIN_API_URL', ''),

  /**
   * MFA API URL for Nellys Coin
   */
  mfaApiUrl: env.get('NELLYS_COIN_MFA_API_URL', ''),

  /**
   * Panel URL
   */
  panelUrl: env.get('NELLYS_COIN_PANEL_URL', 'https://testbox-baptiste-panel.ejara.tech'),

  /**
   * Client ID for API authentication
   */
  clientId: env.get('NELLYS_COIN_CLIENT_ID', ''),

  /**
   * Client Secret (used as api-key header)
   */
  clientSecret: env.get('NELLYS_COIN_CLIENT_SECRET', ''),

  /**
   * Client ID for API mfa authentication
   */
  mfaClientId: env.get('NELLYS_COIN_MFA_CLIENT_ID', ''),

  /**
   * Client Secret (used as api-key header)
   */
  mfaClientSecret: env.get('NELLYS_COIN_MFA_CLIENT_SECRET', ''),
  /**
   * API timeout in milliseconds
   */
  timeout: Number(env.get('NELLYS_COIN_TIMEOUT', '30000')),

  /**
   * Whether to log API requests/responses
   */
  debug: env.get('NELLYS_COIN_DEBUG', 'false') === 'true',

  /**
   * Test mode - uses sandbox URLs when true
   */
  testMode: env.get('NODE_ENV') !== 'production',
}

export default nellyCoinConfig
