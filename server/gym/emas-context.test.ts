import { describe, expect, it, vi } from 'vitest'
import { getEmasIdentity } from './emas-context'

describe('getEmasIdentity', () => {
  it('reads the user id from the cloud-function SDK shape', async () => {
    const getInfo = vi.fn(async () => ({
      user: { userId: 'emas-user-1' },
    }))

    await expect(
      getEmasIdentity({
        mpserverless: { user: { getInfo } },
      }),
    ).resolves.toEqual({ emasUserId: 'emas-user-1' })
    expect(getInfo).toHaveBeenCalledOnce()
  })

  it('reads the user id from the client SDK shape', async () => {
    const getInfo = vi.fn(async () => ({
      success: true,
      result: { user: { userId: 'emas-user-1' } },
    }))

    await expect(
      getEmasIdentity({
        mpserverless: { user: { getInfo } },
      }),
    ).resolves.toEqual({ emasUserId: 'emas-user-1' })
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

  it('returns no identity when the user lookup fails', async () => {
    await expect(
      getEmasIdentity({
        mpserverless: {
          user: {
            getInfo: vi.fn(async () => {
              throw new Error('unauthorized')
            }),
          },
        },
      }),
    ).resolves.toBeUndefined()
  })
})
