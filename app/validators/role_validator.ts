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
      .regex(/^[a-z_]+$/)
      .notIn(['admin', 'super_admin', 'user'])
      .unique(async (db, value) => {
        //  Vérification d'unicité en DB
        const role = await db.from('roles').where('name', value).first()
        return !role
      }),
    displayName: vine.string().trim().minLength(2).maxLength(100),
    description: vine.string().trim().maxLength(500).optional(),
    isActive: vine.boolean().optional(),
    permissionIds: vine
      .array(
        vine
          .number()
          .positive()
          .exists(async (db, value) => {
            //  Vérifier que les permissions existent
            const permission = await db.from('permissions').where('id', value).first()
            return !!permission
          })
      )
      .maxLength(100) //  Limite de sécurité
      .optional(),
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
    permissionIds: vine
      .array(
        vine
          .number()
          .positive()
          .exists(async (db, value) => {
            //  Vérifier que les permissions existent
            const permission = await db.from('permissions').where('id', value).first()
            return !!permission
          })
      )
      .maxLength(100) // Limite de sécurité
      .optional(),
  })
)

/**
 * Validator for assigning permissions to a role
 */
export const assignPermissionsValidator = vine.compile(
  vine.object({
    permissionIds: vine
      .array(
        vine
          .number()
          .positive()
          .exists(async (db, value) => {
            // Vérifier que les permissions existent
            const permission = await db.from('permissions').where('id', value).first()
            return !!permission
          })
      )
      .minLength(1)
      .maxLength(100),
  })
)

/**
 * Validator for assigning role to user
 */
export const assignRoleToUserValidator = vine.compile(
  vine.object({
    roleId: vine
      .number()
      .positive()
      .exists(async (db, value) => {
        //  Vérifier que le rôle existe et est actif
        const role = await db.from('roles').where('id', value).where('is_active', true).first()
        return !!role
      }),
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
    permissionId: vine
      .number()
      .positive()
      .exists(async (db, value) => {
        //  Vérifier que la permission existe
        const permission = await db.from('permissions').where('id', value).first()
        return !!permission
      }),
    expiresAt: vine
      .date({
        formats: ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD', 'iso8601'],
      })
      .afterOrEqual('today')
      .optional(),
  })
)

/**
 * Validator for role search/filter (pour tes endpoints de listing)
 */
export const roleSearchValidator = vine.compile(
  vine.object({
    search: vine.string().minLength(2).maxLength(100).trim().optional(),
    isActive: vine.boolean().optional(),
    includePermissions: vine.boolean().optional(),
    page: vine.number().positive().optional(),
    limit: vine.number().range([1, 100]).optional(),
  })
)

/**
 * Validator for removing role from user
 */
export const removeRoleFromUserValidator = vine.compile(
  vine.object({
    roleId: vine
      .number()
      .positive()
      .exists(async (db, value) => {
        const role = await db.from('roles').where('id', value).first()
        return !!role
      }),
  })
)
