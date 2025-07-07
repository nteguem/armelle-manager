/**
 * Nellys Coin API Types
 */

// Login Request
export interface LoginRequest {
  log: string // email or username
  password: string // encrypted password
  longitude?: string
  latitude?: string
  ipAddress?: string
  deviceId?: string
  location?: string
}

// Login Response
export interface LoginResponse {
  responsecode: string
  message: string
  token?: string
  refresh_token?: string
  expires_in?: string
  refresh_token_expires_in?: string
  token_type?: string
  data: {
    canAccessPanel: boolean
    shouldCompleteMfa: boolean
    loginReference?: string
    mfaData?: any // MFA related object
    [key: string]: any // Other customer data
  }
}

// MFA Confirmation Request
export interface MfaConfirmRequest {
  code: string
  mfaReference?: string
  loginReference: string
}

// Password Reset Initiate Request
export interface PasswordResetInitiateRequest {
  verificationMode: 'email' | 'phone'
  emailAddress?: string
  countryCode?: string
  phoneNumber?: string
  deviceId?: string
}

// Password Reset Verify Request
export interface PasswordResetVerifyRequest {
  code: string
  verificationMode: 'email' | 'phone'
  emailAddress?: string
  countryCode?: string
  phoneNumber?: string
}

// Password Reset Complete Request
export interface PasswordResetCompleteRequest {
  password: string
  code: string
}

// Generic Success Response
export interface SuccessResponse {
  responseCode: string
  message: string
  data?: any
}

// Error Response
export interface ErrorResponse {
  message: string
  errorCode: string
}

// User data from token
export interface NellysCoinUser {
  id: string | number
  email?: string
  username?: string
  canAccessPanel: boolean
  [key: string]: any
}
