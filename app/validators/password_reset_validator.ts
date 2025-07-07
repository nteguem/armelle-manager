import vine from '@vinejs/vine'

/**
 * Password reset initiate validator
 */
export const passwordResetInitiateValidator = vine.compile(
  vine.object({
    verificationMode: vine.enum(['email', 'phone']),
    emailAddress: vine.string().email().optional().requiredWhen('verificationMode', '=', 'email'),
    countryCode: vine.string().optional().requiredWhen('verificationMode', '=', 'phone'),
    phoneNumber: vine.string().optional().requiredWhen('verificationMode', '=', 'phone'),
    deviceId: vine.string().optional(),
  })
)

/**
 * Password reset code verification validator
 */
export const passwordResetVerifyValidator = vine.compile(
  vine.object({
    code: vine.string().trim(),
    verificationMode: vine.enum(['email', 'phone']),
    emailAddress: vine.string().email().optional().requiredWhen('verificationMode', '=', 'email'),
    countryCode: vine.string().optional().requiredWhen('verificationMode', '=', 'phone'),
    phoneNumber: vine.string().optional().requiredWhen('verificationMode', '=', 'phone'),
  })
)

/**
 * Password reset complete validator
 */
export const passwordResetCompleteValidator = vine.compile(
  vine.object({
    password: vine.string().minLength(6).maxLength(200),
    code: vine.string().trim(),
  })
)
