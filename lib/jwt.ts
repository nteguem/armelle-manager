import env from '#start/env'
import jwt from 'jsonwebtoken'

export const encode = (payload: any) => {
  return jwt.sign(payload, env.get('JWT_SECRET'), { expiresIn: `${env.get('JWT_EXPIRES_IN')}h` })
}

export const decode = (token: string) => {
  return jwt.verify(token, env.get('JWT_SECRET')!)
}
