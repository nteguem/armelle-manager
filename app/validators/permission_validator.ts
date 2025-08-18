import vine from '@vinejs/vine'

/**
 * Validator for granting permission to user
 */
export const grantPermissionToUserValidator = vine.compile(
  vine.object({
    permissionId: vine
      .number()
      .withoutDecimals()
      .positive()
      .exists(async (db, value) => {
        const permission = await db.from('permissions').where('id', value).first()
        return !!permission
      }),
    expiresAt: vine
      .date()
      .after('today') // CORRECTION: after + ordre
      .optional(), // CORRECTION: optional en dernier
  })
)

/**
 * Validator for checking user permission
 */
export const checkUserPermissionValidator = vine.compile(
  vine.object({
    permission: vine
      .string()
      .minLength(3)
      .maxLength(100)
      .regex(/^[a-zA-Z0-9_.-]+$/)
      .trim(),
  })
)

/**
 * Validator for assigning role to user
 */
export const assignRoleToUserValidator = vine.compile(
  vine.object({
    roleId: vine
      .number()
      .withoutDecimals()
      .positive()
      .exists(async (db, value) => {
        const role = await db.from('roles').where('id', value).where('is_active', true).first()
        return !!role
      }),
    expiresAt: vine
      .date()
      .after('today') // CORRECTION: after + ordre
      .optional(), // CORRECTION: optional en dernier
  })
)

/**
 * Validator for permission search/filter
 */
export const permissionSearchValidator = vine.compile(
  vine.object({
    module: vine
      .string()
      .minLength(2) // CORRECTION: validations avant optional
      .maxLength(50)
      .regex(/^[a-zA-Z0-9_-]+$/)
      .trim()
      .optional(), // CORRECTION: optional en dernier
    search: vine
      .string()
      .minLength(2) // CORRECTION: validations avant optional
      .maxLength(100)
      .trim()
      .optional(), // CORRECTION: optional en dernier
    page: vine.number().withoutDecimals().positive().optional(),
    limit: vine.number().withoutDecimals().range([1, 100]).optional(),
    grouped: vine.boolean().optional(),
    include_permissions: vine.boolean().optional(),
  })
)

/**
 * Validator for user permissions listing
 */
export const userPermissionsListValidator = vine.compile(
  vine.object({
    userId: vine
      .number()
      .withoutDecimals()
      .positive()
      .exists(async (db, value) => {
        const user = await db.from('users').where('id', value).first()
        return !!user
      }),
    source: vine.enum(['role', 'direct']).optional(),
    page: vine.number().withoutDecimals().positive().optional(),
    limit: vine.number().withoutDecimals().range([1, 100]).optional(),
  })
)

/**
 * Custom validation rules for permissions
 */
export const permissionValidationRules = {
  isValidPermissionName: (value: string): boolean => {
    const parts = value.split('.')
    return parts.length === 2 && parts.every((part) => part.length > 0)
  },

  isWildcardPermission: (value: string): boolean => {
    return value.endsWith('.*')
  },

  getModuleFromPermission: (permissionName: string): string => {
    return permissionName.split('.')[0] || ''
  },

  getActionFromPermission: (permissionName: string): string => {
    const parts = permissionName.split('.')
    return parts[1] || ''
  },
}
