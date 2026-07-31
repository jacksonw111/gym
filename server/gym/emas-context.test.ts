import { describe, expect, it, vi } from 'vitest'
import { getEmasIdentity } from './emas-context'

describe('getEmasIdentity', () => {
  it('reads the authenticated EMAS user id from the function context', async () => {
    const getInfo = vi.fn(async () => ({
      success: true,
      result: { user: { userId: 'emas-user-1' } },
    }))

    await expect(
      getEmasIdentity({
        mpserverless: { user: { getInfo } },
      }),
    ).resolves.toEqual({ emasUserId: 'emas-user-1' })
    expect(getInfo).toHaveBeenCalledOnce()
  })

  it('returns no identity when EMAS has no authenticated user', async () => {
    await expect(
      getEmasIdentity({
        mpserverless: {
          user: {
            getInfo: vi.fn(async () => ({ success: true, result: {} })),
          },
        },
      }),
    ).resolves.toBeUndefined()
  })
})
