import vine from '@vinejs/vine'

/**
 * Login validator - matching actual API structure
 */
export const loginValidator = vine.compile(
  vine.object({
    loginOption: vine.string().trim().in(['username', 'email']),
    usernameOrPhoneNumber: vine.string().trim().minLength(3), // email or username
    password: vine.string().minLength(6),
    longitude: vine.string().optional(),
    latitude: vine.string().optional(),
    ipAddress: vine.string().optional(),
    deviceId: vine.string().optional(),
    location: vine.string().optional(),
  })
)

export const mfaVerifyValidator = vine.compile(
  vine.object({
    code: vine.string().trim().minLength(6).maxLength(6),
  })
)

/**
 * MFA confirmation validator
 */
export const mfaConfirmValidator = vine.compile(
  vine.object({
    otpCode: vine.string().trim().minLength(6).maxLength(6),
    loginReference: vine.string().trim(),
  })
)

/**
 * Refresh token validator
 */
export const refreshTokenValidator = vine.compile(
  vine.object({
    refresh_token: vine.string().trim(),
  })
)
