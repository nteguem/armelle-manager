import vine from '@vinejs/vine'

/**
 * Validator for creating a role
 */
export const createRoleValidator = vine.compile(
  vine.object({
    name: vine
      .string()
      .trim()
      .minLength(2)
      .maxLength(50)
      .regex(/^[a-z_]+$/) // Only lowercase letters and underscores
      .notIn(['admin', 'super_admin', 'user']), // Reserved names
    displayName: vine.string().trim().minLength(2).maxLength(100),
    description: vine.string().trim().maxLength(500).optional(),
    isActive: vine.boolean().optional(),
    permissionIds: vine.array(vine.number().positive()).optional(),
  })
)

/**
 * Validator for updating a role
 */
export const updateRoleValidator = vine.compile(
  vine.object({
    displayName: vine.string().trim().minLength(2).maxLength(100).optional(),
    description: vine.string().trim().maxLength(500).nullable().optional(),
    isActive: vine.boolean().optional(),
    permissionIds: vine.array(vine.number().positive()).optional(),
  })
)

/**
 * Validator for assigning permissions to a role
 */
export const assignPermissionsValidator = vine.compile(
  vine.object({
    permissionIds: vine.array(vine.number().positive()),
  })
)

/**
 * Validator for assigning role to user
 */
export const assignRoleToUserValidator = vine.compile(
  vine.object({
    roleId: vine.number().positive(),
    expiresAt: vine
      .date({
        formats: ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD', 'iso8601'],
      })
      .afterOrEqual('today')
      .optional(),
  })
)

/**
 * Validator for granting permission to user
 */
export const grantPermissionToUserValidator = vine.compile(
  vine.object({
    permissionId: vine.number().positive(),
    expiresAt: vine
      .date({
        formats: ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD', 'iso8601'],
      })
      .afterOrEqual('today')
      .optional(),
  })
)
