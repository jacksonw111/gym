import { describe, expect, it, vi } from 'vitest'
import { EmasStore, type EmasDatabase, type EmasTransaction } from './store-emas'

describe('EmasStore transactions', () => {
  it('does not scan collections after starting a single-document transaction', async () => {
    const records = new Map<string, Array<Record<string, unknown>>>([
      [
        'admins',
        [
          {
            id: 'admin-1',
            username: 'admin',
            passwordHash: 'password-hash',
          },
        ],
      ],
    ])
    const replaceOne = vi.fn(async () => ({ result: {} }))
    const commit = vi.fn(async () => undefined)
    const rollback = vi.fn(async () => undefined)
    const transaction: EmasTransaction = {
      collection: () => ({
        find: vi.fn(async () => {
          throw new Error('EMAS transactions cannot scan collections')
        }),
        replaceOne,
        deleteOne: vi.fn(async () => ({ result: {} })),
      }),
      commit,
      rollback,
    }
    const database: EmasDatabase = {
      collection: (name) => ({
        find: vi.fn(async () => ({ result: records.get(name) ?? [] })),
        replaceOne: vi.fn(async () => ({ result: {} })),
        deleteOne: vi.fn(async () => ({ result: {} })),
      }),
      startTransaction: vi.fn(async () => transaction),
    }
    const store = new EmasStore(database)
    await store.load()

    await store.transaction(() => {
      store.sessions.push({
        id: 'session-1',
        token: 'token-1',
        adminId: 'admin-1',
        expiresAt: '2026-08-01T00:00:00.000Z',
      })
    })

    expect(replaceOne).toHaveBeenCalledWith(
      { id: 'session-1' },
      expect.objectContaining({ token: 'token-1' }),
      { upsert: true },
    )
    expect(commit).toHaveBeenCalledOnce()
    expect(rollback).not.toHaveBeenCalled()
  })
})
