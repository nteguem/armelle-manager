import vine from '@vinejs/vine'

/**
 * Login validator
 */
export const loginValidator = vine.compile(
  vine.object({
    log: vine.string().trim().minLength(3),
    password: vine.string().minLength(6),
    longitude: vine.string().optional(),
    latitude: vine.string().optional(),
    ipAddress: vine.string().optional(),
    deviceId: vine.string().optional(),
    location: vine.string().optional(),
  })
)

export const mfaSetupValidator = vine.compile(
  vine.object({
    loginReference: vine.string().trim(),
  })
)

export const mfaVerifyValidator = vine.compile(
  vine.object({
    code: vine.string().trim().minLength(6).maxLength(6),
    loginReference: vine.string().trim(),
  })
)

/**
 * MFA confirmation validator
 */
export const mfaConfirmValidator = vine.compile(
  vine.object({
    code: vine.string().trim().minLength(6).maxLength(6),
    mfaReference: vine.string().optional(),
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
