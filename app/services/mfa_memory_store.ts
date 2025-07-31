import { LoginResponse } from '../types/nellys_coin_types.js'

class MfaMemoryStore {
  private store = new Map<string, { value: LoginResponse; expiresAt: number }>()

  set(loginReference: string, value: LoginResponse, ttlSeconds = 300) {
    const expiresAt = Date.now() + ttlSeconds * 1000
    this.store.set(loginReference, { value, expiresAt })
  }

  get(loginReference: string): LoginResponse | null {
    const entry = this.store.get(loginReference)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.store.delete(loginReference)
      return null
    }
    return entry.value
  }

  delete(loginReference: string) {
    this.store.delete(loginReference)
  }
}
export type { MfaMemoryStore }
export default new MfaMemoryStore()
