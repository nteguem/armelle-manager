export const ResponseStatus = {
  SUCCESS: 'success',
  ERROR: 'error',
} as const

export const TokenConstants = {
  TYPE: 'Bearer',
  DEFAULT_EXPIRES_IN: 3600, // 1 heure
  REMEMBER_ME_EXPIRES_IN: 604800, // 7 jours
} as const

export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  LOCKED: 423,
  INTERNAL_SERVER_ERROR: 500,
} as const

export const UserStatus = {
  PENDING: 'pending',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
  DELETED: 'deleted',
} as const

export const RoleStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const
