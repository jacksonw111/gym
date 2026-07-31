import { describe, expect, it } from 'vitest'
import { EmasStore, type EmasDatabase, type EmasQuery, type EmasTransaction } from './store-emas'

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

class FakeQuery implements EmasQuery {
  constructor(private readonly documents: Map<string, Record<string, unknown>>) {}

  async find(
    _filter: Record<string, unknown> = {},
    options: { skip?: number; limit?: number } = {},
  ) {
    const skip = options.skip ?? 0
    const limit = options.limit ?? 100
    return {
      result: [...this.documents.values()].slice(skip, skip + limit).map(copy),
    }
  }

  async replaceOne(
    filter: Record<string, unknown>,
    record: Record<string, unknown>,
  ): Promise<{ result: unknown }> {
    this.documents.set(String(filter.id), copy(record))
    return { result: { affectedDocs: 1 } }
  }

  async deleteOne(filter: Record<string, unknown>): Promise<{ result: unknown }> {
    this.documents.delete(String(filter.id))
    return { result: { affectedDocs: 1 } }
  }
}

class FakeTransaction implements EmasTransaction {
  constructor(
    readonly collections: Map<string, Map<string, Record<string, unknown>>>,
    private readonly commitWork: (
      collections: Map<string, Map<string, Record<string, unknown>>>,
    ) => void,
    private readonly release: () => void,
  ) {}

  collection(name: string): EmasQuery {
    let documents = this.collections.get(name)
    if (!documents) {
      documents = new Map()
      this.collections.set(name, documents)
    }
    return new FakeQuery(documents)
  }

  async commit(): Promise<unknown> {
    this.commitWork(this.collections)
    this.release()
    return { result: { committed: true } }
  }

  async rollback(): Promise<unknown> {
    this.release()
    return { result: { rolledBack: true } }
  }
}

class FakeEmasDatabase implements EmasDatabase {
  readonly collections = new Map<string, Map<string, Record<string, unknown>>>()
  private queue: Promise<void> = Promise.resolve()

  collection(name: string): EmasQuery {
    let documents = this.collections.get(name)
    if (!documents) {
      documents = new Map()
      this.collections.set(name, documents)
    }
    return new FakeQuery(documents)
  }

  async startTransaction(): Promise<EmasTransaction> {
    let release = (): void => undefined
    const previous = this.queue
    this.queue = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    const snapshot = new Map(
      [...this.collections.entries()].map(([name, documents]) => [
        name,
        new Map([...documents.entries()].map(([id, value]) => [id, copy(value)])),
      ]),
    )
    return new FakeTransaction(
      snapshot,
      (collections) => {
        this.collections.clear()
        for (const [name, documents] of collections) {
          this.collections.set(name, documents)
        }
      },
      release,
    )
  }
}

describe('EmasStore', () => {
  it('loads and persists domain records through an EMAS transaction', async () => {
    const database = new FakeEmasDatabase()
    await database.collection('users').replaceOne(
      { id: 'member-1' },
      {
        id: 'member-1',
        emasUserId: 'emas-user-1',
        name: '原姓名',
        roles: ['member'],
      },
    )
    const store = new EmasStore(database)

    await store.load()
    await store.transaction(() => {
      const member = store.users[0]
      if (!member) throw new Error('会员不存在')
      member.name = '新姓名'
    })

    const result = await database.collection('users').find()
    expect(result.result).toContainEqual(expect.objectContaining({ name: '新姓名' }))
  })

  it('rolls back every persisted change when domain work fails', async () => {
    const database = new FakeEmasDatabase()
    await database.collection('users').replaceOne(
      { id: 'member-1' },
      {
        id: 'member-1',
        emasUserId: 'emas-user-1',
        name: '原姓名',
        roles: ['member'],
      },
    )
    const store = new EmasStore(database)
    await store.load()

    await expect(
      store.transaction(() => {
        const member = store.users[0]
        if (!member) throw new Error('会员不存在')
        member.name = '不应保存'
        throw new Error('事务失败')
      }),
    ).rejects.toThrow('事务失败')

    const result = await database.collection('users').find()
    expect(result.result).toContainEqual(expect.objectContaining({ name: '原姓名' }))
  })
})
