import { describe, expect, it } from 'vitest'
import { bookLesson } from './lessons'
import { MemoryStore } from './store'
import { CloudBaseStore, type CloudDatabase } from './store-cloudbase'

class FakeDocument {
  constructor(
    private readonly documents: Map<string, Record<string, unknown>>,
    private readonly id: string,
  ) {}

  async get() {
    return { data: this.documents.get(this.id) ?? null }
  }

  async set(data: Record<string, unknown>) {
    this.documents.set(this.id, structuredClone(data))
  }

  async remove() {
    this.documents.delete(this.id)
  }
}

class FakeCollection {
  constructor(
    private readonly documents: Map<string, Record<string, unknown>>,
    private readonly offset = 0,
    private readonly pageSize = 100,
  ) {}

  async get() {
    return {
      data: [...this.documents.entries()]
        .slice(this.offset, this.offset + this.pageSize)
        .map(([id, value]) => ({ _id: id, ...value })),
    }
  }

  doc(id: string) {
    return new FakeDocument(this.documents, id)
  }

  limit(pageSize: number) {
    return new FakeCollection(this.documents, this.offset, pageSize)
  }

  skip(offset: number) {
    return new FakeCollection(this.documents, offset, this.pageSize)
  }
}

class FakeDatabase implements CloudDatabase {
  readonly collections = new Map<string, Map<string, Record<string, unknown>>>()
  private transactionQueue: Promise<void> = Promise.resolve()

  collection(name: string) {
    let documents = this.collections.get(name)
    if (!documents) {
      documents = new Map()
      this.collections.set(name, documents)
    }
    return new FakeCollection(documents)
  }

  async runTransaction<T>(work: (transaction: CloudDatabase) => Promise<T>): Promise<T> {
    let release = (): void => undefined
    const previous = this.transactionQueue
    this.transactionQueue = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      const transaction = new FakeDatabase()
      for (const [name, documents] of this.collections) {
        transaction.collections.set(
          name,
          new Map([...documents.entries()].map(([id, value]) => [id, structuredClone(value)])),
        )
      }
      const result = await work(transaction)
      this.collections.clear()
      for (const [name, documents] of transaction.collections) {
        this.collections.set(name, documents)
      }
      return result
    } finally {
      release()
    }
  }
}

class TransactionBusyDatabase implements CloudDatabase {
  readonly collections = new Map<string, Map<string, Record<string, unknown>>>()

  collection(name: string) {
    let documents = this.collections.get(name)
    if (!documents) {
      documents = new Map()
      this.collections.set(name, documents)
    }
    return new FakeCollection(documents)
  }

  async runTransaction<T>(work: (transaction: CloudDatabase) => Promise<T>): Promise<T> {
    let readInProgress = false
    const transaction = {
      collection: (name: string) => {
        const documents = this.collections.get(name) ?? new Map<string, Record<string, unknown>>()
        this.collections.set(name, documents)
        const collection = {
          async get() {
            if (readInProgress) {
              throw new Error('[ResourceUnavailable.TransactionBusy] Transaction is busy.')
            }
            readInProgress = true
            await Promise.resolve()
            readInProgress = false
            return { data: [] }
          },
          doc(id: string) {
            return new FakeDocument(documents, id)
          },
          limit() {
            return collection
          },
          skip() {
            return collection
          },
        }
        return collection
      },
      runTransaction: this.runTransaction.bind(this),
    }
    return work(transaction)
  }
}

describe('CloudBaseStore', () => {
  it('事务内依次读取集合，避免 CloudBase TransactionBusy', async () => {
    const store = new CloudBaseStore(new TransactionBusyDatabase())

    await expect(store.transaction(() => undefined)).resolves.toBeUndefined()
  })

  it('从核心集合加载数据，并在数据库事务中持久化领域变更', async () => {
    const database = new FakeDatabase()
    await database.collection('memberships').doc('package-1').set({
      id: 'package-1',
      memberId: 'member-1',
      coachId: 'coach-1',
      coachName: '教练',
      productId: 'product-1',
      productName: '私教课',
      purchasePriceCents: 500,
      totalLessons: 1,
      availableLessons: 1,
      lockedLessons: 0,
      usedLessons: 0,
      purchasedAt: '2026-07-01T00:00:00.000Z',
    })
    const store = new CloudBaseStore(database)

    await store.load()
    expect(store.packages[0]?.availableLessons).toBe(1)

    await store.transaction(() => {
      const membership = store.packages[0]
      if (!membership) throw new Error('课包不存在')
      membership.availableLessons = 0
      membership.lockedLessons = 1
    })

    const reloaded = (await database.collection('memberships').doc('package-1').get())
      .data as Record<string, unknown>
    expect(reloaded).toMatchObject({ availableLessons: 0, lockedLessons: 1 })
    expect(reloaded).not.toHaveProperty('data')
  })

  it('分页加载超过100条记录，末页数据参与幂等和唯一性判断', async () => {
    const database = new FakeDatabase()
    const users = database.collection('users')
    for (let index = 0; index < 205; index += 1) {
      await users.doc(`member-${index}`).set({
        id: `member-${index}`,
        openId: `openid-${index}`,
        name: `会员${index}`,
        roles: ['member'],
      })
    }
    const store = new CloudBaseStore(database)

    await store.load()

    expect(store.users).toHaveLength(205)
    expect(store.users.at(-1)?.openId).toBe('openid-204')
  })

  it('CloudBase事务失败时不提交任何字段变更', async () => {
    const database = new FakeDatabase()
    await database
      .collection('users')
      .doc('member-1')
      .set({
        id: 'member-1',
        openId: 'openid-1',
        name: '原姓名',
        roles: ['member'],
      })
    const store = new CloudBaseStore(database)
    await store.load()

    await expect(
      store.transaction(() => {
        const user = store.users[0]
        if (!user) throw new Error('会员不存在')
        user.name = '不应保存'
        throw new Error('事务失败')
      }),
    ).rejects.toThrow('事务失败')

    expect((await database.collection('users').doc('member-1').get()).data).toMatchObject({
      name: '原姓名',
    })
  })

  it('CloudBase事务锁内检查同一教练时段，并发只成功一次', async () => {
    const database = new FakeDatabase()
    await database.collection('coaches').doc('coach-1').set({
      id: 'coach-1',
      userId: 'coach-user-1',
      name: '教练',
      status: 'active',
    })
    await database.collection('schedules').doc('slot-1').set({
      id: 'slot-1',
      coachId: 'coach-1',
      startsAt: '2026-08-01T10:00:00.000Z',
      endsAt: '2026-08-01T11:00:00.000Z',
      open: true,
    })
    for (const memberId of ['member-1', 'member-2']) {
      await database
        .collection('memberships')
        .doc(`package-${memberId}`)
        .set({
          id: `package-${memberId}`,
          memberId,
          coachId: 'coach-1',
          coachName: '教练',
          productId: 'product-1',
          productName: '私教课',
          purchasePriceCents: 500,
          totalLessons: 1,
          availableLessons: 1,
          lockedLessons: 0,
          usedLessons: 0,
          purchasedAt: '2026-07-01T00:00:00.000Z',
        })
    }
    const firstStore = new CloudBaseStore(database)
    const secondStore = new CloudBaseStore(database)
    await Promise.all([firstStore.load(), secondStore.load()])

    const results = await Promise.allSettled(
      [
        { memberId: 'member-1', store: firstStore },
        { memberId: 'member-2', store: secondStore },
      ].map(({ memberId, store }) =>
        bookLesson(store, {
          memberId,
          coachId: 'coach-1',
          packageId: `package-${memberId}`,
          startsAt: '2026-08-01T10:00:00.000Z',
          requestId: `book-${memberId}`,
          now: '2026-07-30T00:00:00.000Z',
        }),
      ),
    )

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    await firstStore.load()
    expect(firstStore.lessons).toHaveLength(1)
    expect(firstStore.packages.reduce((sum, item) => sum + item.lockedLessons, 0)).toBe(1)
  })

  it('内存事务失败时回滚领域数组', async () => {
    const store = new MemoryStore({
      users: [
        {
          id: 'member-1',
          openId: 'openid-1',
          name: '原姓名',
          roles: ['member'],
        },
      ],
    })

    await expect(
      store.transaction(() => {
        const user = store.users[0]
        if (!user) throw new Error('会员不存在')
        user.name = '不应保存'
        store.orders.push({
          id: 'order-rollback',
          requestId: 'purchase-rollback',
          memberId: user.id,
          coachId: 'coach-1',
          coachName: '教练',
          productId: 'product-1',
          productSnapshot: {
            id: 'product-1',
            name: '课包',
            priceCents: 100,
            lessonCount: 1,
          },
          status: 'pending',
          createdAt: '2026-07-30T00:00:00.000Z',
        })
        throw new Error('事务失败')
      }),
    ).rejects.toThrow('事务失败')

    expect(store.users[0]?.name).toBe('原姓名')
    expect(store.orders).toEqual([])
  })
})
