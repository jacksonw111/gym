import { describe, expect, it } from 'vitest'
import { MemoryStore } from '../../../../server/gym/store'
import { createSeedEntrypoint } from './index'

const seedInput = {
  seedToken: 'seed-token',
  admin: {
    id: 'admin-1',
    username: 'admin',
    passwordHash: 'password-hash',
  },
  products: [
    {
      id: 'product-1',
      name: '十节私教课',
      priceCents: 5000,
      lessonCount: 10,
      status: 'published' as const,
    },
  ],
  coaches: [],
}

describe('EMAS seed function', () => {
  it('requires the private seed token and applies fixed records idempotently', async () => {
    const store = new MemoryStore()
    const entrypoint = createSeedEntrypoint({
      storeFactory: () => store,
      seedInput,
    })

    await expect(
      entrypoint({ args: { seedToken: 'wrong-token' } } as never),
    ).resolves.toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } })

    await entrypoint({ args: { seedToken: 'seed-token' } } as never)
    await entrypoint({ args: { seedToken: 'seed-token' } } as never)

    expect(store.admins).toEqual([seedInput.admin])
    expect(store.products).toEqual(seedInput.products)
  })
})
