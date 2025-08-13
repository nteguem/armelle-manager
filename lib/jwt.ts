import env from '#start/env'
import jwt from 'jsonwebtoken'

export const encode = (payload: any) => {
  const secret = env.get('JWT_SECRET')
  return jwt.sign(payload, secret, { expiresIn: `${env.get('JWT_EXPIRES_IN')}h` })
}

export const decode = (token: string) => {
  const secret = env.get('JWT_SECRET')
  return jwt.verify(token, secret!)
}
