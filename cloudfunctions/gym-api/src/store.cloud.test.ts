import { describe, expect, it } from 'vitest'
import { CloudBaseStore, type CloudDatabase } from './store-cloudbase'

class FakeDocument {
  constructor(
    private readonly documents: Map<string, Record<string, unknown>>,
    private readonly id: string,
  ) {}

  async get() {
    return { data: this.documents.get(this.id) ?? null }
  }

  async set(input: { data: Record<string, unknown> }) {
    this.documents.set(this.id, structuredClone(input.data))
  }

  async remove() {
    this.documents.delete(this.id)
  }
}

class FakeCollection {
  constructor(private readonly documents: Map<string, Record<string, unknown>>) {}

  async get() {
    return {
      data: [...this.documents.entries()].map(([id, value]) => ({ _id: id, ...value })),
    }
  }

  doc(id: string) {
    return new FakeDocument(this.documents, id)
  }
}

class FakeDatabase implements CloudDatabase {
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
    return work(this)
  }
}

describe('CloudBaseStore', () => {
  it('从核心集合加载数据，并在数据库事务中持久化领域变更', async () => {
    const database = new FakeDatabase()
    await database
      .collection('membership_packages')
      .doc('package-1')
      .set({
        data: {
          id: 'package-1',
          memberId: 'member-1',
          coachId: 'coach-1',
          productId: 'product-1',
          productName: '私教课',
          purchasePriceCents: 500,
          totalLessons: 1,
          availableLessons: 1,
          lockedLessons: 0,
          usedLessons: 0,
          purchasedAt: '2026-07-01T00:00:00.000Z',
        },
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

    expect(
      (await database.collection('membership_packages').doc('package-1').get()).data,
    ).toMatchObject({ availableLessons: 0, lockedLessons: 1 })
  })
})
