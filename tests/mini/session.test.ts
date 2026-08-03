import { beforeEach, describe, expect, it } from 'vitest'
import { createSessionAwareApi } from '../../miniprogram/services/api'
import { DevelopmentApi } from '../../miniprogram/services/development-api'
import { DevelopmentStore, type StorageAdapter } from '../../miniprogram/services/development-store'
import {
  clearLoggedOut,
  isLocallyLoggedOut,
  markLoggedOut,
} from '../../miniprogram/services/session'

class MemoryStorage implements StorageAdapter {
  private value: unknown

  get(): unknown {
    return this.value
  }

  set(value: unknown): void {
    this.value = value
  }

  clear(): void {
    this.value = undefined
  }
}

interface WechatLike {
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: unknown): void
  removeStorageSync(key: string): void
}

const createApi = (): DevelopmentApi =>
  new DevelopmentApi(
    new DevelopmentStore(new MemoryStorage(), () => new Date('2026-08-01T08:00:00+08:00')),
    () => new Date('2026-08-01T08:00:00+08:00'),
  )

describe('mini program local logout', () => {
  beforeEach(() => {
    const storage = new Map<string, unknown>()
    ;(globalThis as unknown as { wx: WechatLike }).wx = {
      getStorageSync: (key) => storage.get(key),
      setStorageSync: (key, value) => {
        storage.set(key, value)
      },
      removeStorageSync: (key) => {
        storage.delete(key)
      },
    }
  })

  it('keeps the server session while logged in', async () => {
    const api = createSessionAwareApi(createApi())

    const session = await api.getSession()
    expect(session.authenticated).toBe(true)

    const home = await api.getMemberHome()
    expect(home.authenticated).toBe(true)
    expect(home.memberships.length).toBeGreaterThan(0)
  })

  it('returns the guest view after logout and restores the session after re-login', async () => {
    const api = createSessionAwareApi(createApi())
    markLoggedOut()
    expect(isLocallyLoggedOut()).toBe(true)

    expect(await api.getSession()).toEqual({ authenticated: false })

    const home = await api.getMemberHome()
    expect(home.authenticated).toBe(false)
    expect(home.user).toBeUndefined()
    expect(home.memberships).toEqual([])
    expect(home.lessons).toEqual([])
    expect(home.products.length).toBeGreaterThan(0)
    expect(home.coaches.length).toBeGreaterThan(0)

    expect(await api.listMemberLessons()).toEqual({ upcoming: [], history: [] })

    clearLoggedOut()
    expect(isLocallyLoggedOut()).toBe(false)
    expect(await api.getSession()).toMatchObject({ authenticated: true })
    expect((await api.listMemberLessons()).upcoming.length).toBeGreaterThan(0)
  })

  it('still delegates server mutations while logged out', async () => {
    const api = createSessionAwareApi(createApi())
    markLoggedOut()

    const purchase = await api.purchasePackage({
      productId: 'product-strength-12',
      coachId: 'coach-lin',
      requestId: 'buy-while-logged-out',
    })
    expect(purchase.status).toBe('paid')
  })
})
