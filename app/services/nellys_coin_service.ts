import { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import nellyCoinConfig from '#config/nellys_coin'
import type {
  LoginRequest,
  LoginResponse,
  MfaConfirmRequest,
  PasswordResetInitiateRequest,
  PasswordResetVerifyRequest,
  PasswordResetCompleteRequest,
  SuccessResponse,
  ErrorResponse,
} from '../types/nellys_coin_types.js'

export default class NellysCoinService {
  private baseUrl: string
  private timeout: number
  private debug: boolean
  private clientId: string
  private clientSecret: string

  constructor() {
    this.baseUrl = nellyCoinConfig.apiUrl
    this.timeout = nellyCoinConfig.timeout
    this.debug = nellyCoinConfig.debug
    this.clientId = nellyCoinConfig.clientId
    this.clientSecret = nellyCoinConfig.clientSecret
  }

  /**
   * Make HTTP request to Nellys Coin API
   */
  private async request<T>(
    method: string,
    endpoint: string,
    data?: any,
    headers?: any
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`

    // Headers as specified by Nellys Coin
    const requestHeaders = {
      'Content-Type': 'application/json',
      'client-id': this.clientId,
      'api-key': this.clientSecret,
      ...headers,
    }

    try {
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: data ? JSON.stringify(data) : undefined,
        signal: AbortSignal.timeout(this.timeout),
      })

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
      if (this.debug) {
        console.error('[NellysCoin] Error:', error)
      }
      throw error
    }
  }

  /**
   * Login user
   */
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    return this.request<LoginResponse>('POST', '/api/v2/auth/login', credentials)
  }

  /**
   * Confirm MFA code
   */
  async confirmMfa(data: MfaConfirmRequest): Promise<LoginResponse> {
    return this.request<LoginResponse>('POST', '/api/v1/auth/confirm-mfa-code', data)
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
