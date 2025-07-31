import nellyCoinConfig from '#config/nellys_coin'
import { HttpContext } from '@adonisjs/core/http'
import type {
  LoginRequest,
  LoginResponse,
  MfaConfirmRequest,
  MfaSetupResponse,
  PasswordResetCompleteRequest,
  PasswordResetInitiateRequest,
  PasswordResetVerifyRequest,
  SuccessResponse,
} from '../types/nellys_coin_types.js'

export default class NellysCoinService {
  private baseUrl: string
  private mfaUrl: string
  private timeout: number
  private debug: boolean
  private authClientId: string
  private authClientSecret: string
  private mfaClientId: string
  private mfaClientSecret: string
  // Token management
  private authToken: string | null = null
  private refreshToken: string | null = null

  constructor() {
    this.baseUrl = nellyCoinConfig.apiUrl
    this.mfaUrl = nellyCoinConfig.mfaApiUrl
    this.timeout = nellyCoinConfig.timeout
    this.debug = nellyCoinConfig.debug
    this.authClientId = nellyCoinConfig.clientId
    this.authClientSecret = nellyCoinConfig.clientSecret
    this.mfaClientId = nellyCoinConfig.mfaClientId
    this.mfaClientSecret = nellyCoinConfig.mfaClientSecret
  }

  /**
   * Set authentication tokens
   */
  private setTokens(authToken: string, refreshToken?: string): void {
    this.authToken = authToken
    if (refreshToken) {
      this.refreshToken = refreshToken
    }
  }

  /**
   * Clear authentication tokens
   */
  private clearTokens(): void {
    this.authToken = null
    this.refreshToken = null
  }

  /**
   * Get current access token
   */
  private getAccessToken(): string | null {
    return this.authToken
  }

  /**
   * Set authentication token manually (for session restoration)
   */
  public setAuthToken(token: string, refreshToken?: string): void {
    this.setTokens(token, refreshToken)
  }

  /**
   * Make HTTP request to Nellys Coin API
   */
  private async request<T>(
    method: string,
    endpoint: string,
    data?: any,
    headers?: Record<string, string>,
    isMfa?: boolean
  ): Promise<T> {
    const authUrl = `${this.baseUrl}${endpoint}`
    const mfaUrl = `${this.mfaUrl}${endpoint}`

    // Headers as specified by Nellys Coin
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    // Initialize headers object if not provided
    const headersToAdd = headers || {}

    // Add client credentials to headers
    if (isMfa) {
      headersToAdd['client-key'] = this.mfaClientId
      headersToAdd['client-secret'] = this.mfaClientSecret

      // Add Bearer token automatically for MFA requests if available
      if (this.authToken) {
        headersToAdd['Authorization'] = `Bearer ${this.authToken}`
      }
    } else {
      headersToAdd['client-key'] = this.authClientId
      headersToAdd['client-secret'] = this.authClientSecret
    }

    // Merge all headers
    Object.assign(requestHeaders, headersToAdd)

    const makeRequest = async (): Promise<Response> => {
      return fetch(isMfa ? mfaUrl : authUrl, {
        method,
        headers: requestHeaders,
        body: data ? JSON.stringify(data) : undefined,
        signal: AbortSignal.timeout(this.timeout),
      })
    }

    try {
      let response = await makeRequest()
      const responseText = await response.text()
      let responseData: any

      try {
        responseData = JSON.parse(responseText)
      } catch {
        responseData = { message: responseText }
      }

      if (!response.ok) {
        throw responseData
      }

      return responseData
    } catch (error: any) {
      console.error('[NellysCoin] Error:', error)
      throw error
    }
  }

  /**
   * Login user and automatically store tokens
   */
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>(
      'POST',
      '/api/v1/authentication/login',
      credentials,
      {},
      false
    )

    // Store tokens automatically after successful login
    if (response.authToken) {
      this.setTokens(response.authToken)
    }

    return response
  }

  /**
   * Setup Authenticator app for user - Real MFA API
   */
  async setupAuthenticator(authToken: string): Promise<MfaSetupResponse> {
    return this.request<MfaSetupResponse>(
      'POST',
      '/api/v1/mfa/setup-authenticator',
      {},
      { Authorization: `Bearer ${authToken}` },
      true
    )
  }

  /**
   * Verify MFA code (MFA confirmation)
   */
  async verifyAuthenticatorCode(code: string, authToken: string): Promise<LoginResponse> {
    return this.request<LoginResponse>(
      'POST',
      '/api/v1/mfa/validate-authenticator',
      { code },
      { Authorization: `Bearer ${authToken}` },
      true
    )
  }

  /**
   * Verify MFA code
   */
  async verifyMfaCode(code: string): Promise<LoginResponse> {
    return this.request<LoginResponse>('POST', '/api/v1/auth/verify-mfa-code', { code })
  }

  /**
   * Confirm MFA code
   */
  async confirmMfa(data: MfaConfirmRequest): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>(
      'POST',
      '/api/v1/authentication/complete-login',
      data,
      {}
    )

    return response
  }

  /**
   * Initiate password reset
   */
  async initiatePasswordReset(data: PasswordResetInitiateRequest): Promise<SuccessResponse> {
    // For GET requests, convert data to query parameters
    const params = new URLSearchParams()
    Object.keys(data).forEach((key) => {
      const value = data[key as keyof PasswordResetInitiateRequest]
      if (value !== undefined && value !== null) {
        params.append(key, String(value))
      }
    })

    return this.request<SuccessResponse>('GET', `/api/v2/passwords/email?${params.toString()}`)
  }

  /**
   * Verify password reset code
   */
  async verifyPasswordResetCode(data: PasswordResetVerifyRequest): Promise<SuccessResponse> {
    return this.request<SuccessResponse>('POST', '/api/v2/passwords/code', data)
  }

  /**
   * Complete password reset
   */
  async resetPassword(data: PasswordResetCompleteRequest): Promise<SuccessResponse> {
    return this.request<SuccessResponse>('POST', '/api/v2/passwords/reset', data)
  }

  /**
   * Logout and clear tokens
   */
  async logout(): Promise<void> {
    try {
      // Optional: Call logout endpoint if it exists
      // await this.request('POST', '/api/v2/auth/logout')
    } finally {
      this.clearTokens()
    }
  }

  /**
   * Get device ID from context
   */
  getDeviceId(ctx: HttpContext): string | undefined {
    return ctx.request.header('x-device-id') || ctx.request.input('deviceId')
  }

  /**
   * Get location info from context
   */
  getLocationInfo(ctx: HttpContext) {
    return {
      ipAddress: ctx.request.ip(),
      longitude: ctx.request.input('longitude'),
      latitude: ctx.request.input('latitude'),
      location: ctx.request.input('location'),
    }
  }
}
