/**
 * Nellys Coin API Types
 */

// Login Request
export interface LoginRequest {
  loginOption: string
  usernameOrPhoneNumber: string // username or phone number
  password: string // password
  longitude?: string
  latitude?: string
  ipAddress?: string
  deviceId?: string
  location?: string
}

// Login Response - Contains complete auth data but with MFA flag
export interface LoginResponse {
  responsecode: string
  message: string
  authToken?: string
  refreshToken?: string
  expiresIn?: string
  refreshTokenExpiresIn?: string
  tokenType?: string
  data: {
    canAccessPanel: boolean
    shouldCompleteMfa: boolean
    loginReference?: string
    mfaData?: {
      id: number
      status: string
      type: string
    } // MFA related object
    [key: string]: any // Other user data
  }
}

// MFA Confirmation Request (keeping for backward compatibility)
export interface MfaConfirmRequest {
  otpCode: string
  loginReference: string
  mfaReference?: string
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

// MFA Status types
export type MfaStatus = 'pending' | 'verified' | 'active' | 'failed' | 'expired' | 'inactive'

// MFA Setup Request
export interface MfaSetupRequest {
  code: string // e.g. "1234"
}

// MFA Setup Response
export interface MfaSetupResponse {
  message: string
  data: {
    type: 'authenticator'
    status: MfaStatus
    qrCodeUri: string
    setupKey: string
  }
}

// MFA Validate Request
export interface MfaValidateRequest {
  // Empty request body
}

// MFA Validate Response
export interface MfaValidateResponse {
  message: string
  data: {
    type: 'authenticator'
    status: MfaStatus
  }
}
