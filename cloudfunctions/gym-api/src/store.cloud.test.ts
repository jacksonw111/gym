import { describe, expect, it } from 'vitest'
import { createRouter } from './index'
import { bookLesson } from './lessons'
import { MemoryStore } from './store'
import { CloudBaseStore, type CloudDatabase } from './store-cloudbase'

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

class FakeDocument {
  constructor(
    private readonly documents: Map<string, Record<string, unknown>>,
    private readonly id: string,
    private readonly onGet: () => void = () => undefined,
  ) {}

  async get() {
    this.onGet()
    return { data: this.documents.get(this.id) ?? null }
  }

  async set(data: Record<string, unknown>) {
    this.documents.set(this.id, copy(data))
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
    private readonly filter: Record<string, unknown> = {},
    private readonly onGet: () => void = () => undefined,
    private readonly onDocumentGet: (id: string) => void = () => undefined,
  ) {}

  async get() {
    this.onGet()
    return {
      data: [...this.documents.entries()]
        .filter(([, value]) =>
          Object.entries(this.filter).every(([key, expected]) => {
            if (
              expected &&
              typeof expected === 'object' &&
              '__in' in expected &&
              Array.isArray(expected.__in)
            ) {
              return expected.__in.includes(value[key])
            }
            return value[key] === expected
          }),
        )
        .slice(this.offset, this.offset + this.pageSize)
        .map(([id, value]) => ({ _id: id, ...value })),
    }
  }

  doc(id: string) {
    return new FakeDocument(this.documents, id, () => this.onDocumentGet(id))
  }

  limit(pageSize: number) {
    return new FakeCollection(
      this.documents,
      this.offset,
      pageSize,
      this.filter,
      this.onGet,
      this.onDocumentGet,
    )
  }

  skip(offset: number) {
    return new FakeCollection(
      this.documents,
      offset,
      this.pageSize,
      this.filter,
      this.onGet,
      this.onDocumentGet,
    )
  }

  where(filter: Record<string, unknown>) {
    return new FakeCollection(
      this.documents,
      this.offset,
      this.pageSize,
      filter,
      this.onGet,
      this.onDocumentGet,
    )
  }
}

class FakeDatabase implements CloudDatabase {
  readonly collections = new Map<string, Map<string, Record<string, unknown>>>()
  readonly queryLog: string[] = []
  readonly documentReadLog: string[] = []
  readonly command = {
    in: (values: unknown[]) => ({ __in: values }),
  }
  private transactionQueue: Promise<void> = Promise.resolve()

  collection(name: string) {
    let documents = this.collections.get(name)
    if (!documents) {
      documents = new Map()
      this.collections.set(name, documents)
    }
    return new FakeCollection(
      documents,
      0,
      100,
      {},
      () => this.queryLog.push(name),
      (id) => {
        this.queryLog.push(name)
        this.documentReadLog.push(`${name}/${id}`)
      },
    )
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
          new Map([...documents.entries()].map(([id, value]) => [id, copy(value)])),
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
          where() {
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

const seedScopedDatabase = async (): Promise<FakeDatabase> => {
  const database = new FakeDatabase()
  await database
    .collection('users')
    .doc('member-1')
    .set({
      id: 'member-1',
      openId: 'member-openid',
      name: '会员',
      roles: ['member'],
    })
  await database
    .collection('users')
    .doc('coach-user-1')
    .set({
      id: 'coach-user-1',
      openId: 'coach-openid',
      name: '教练账号',
      roles: ['coach'],
    })
  await database.collection('coaches').doc('coach-1').set({
    id: 'coach-1',
    userId: 'coach-user-1',
    name: '教练',
    status: 'active',
  })
  await database.collection('coaches').doc('coach-2').set({
    id: 'coach-2',
    name: '接收教练',
    status: 'active',
  })
  await database.collection('products').doc('product-1').set({
    id: 'product-1',
    name: '私教课',
    priceCents: 100,
    lessonCount: 1,
    coachId: 'coach-1',
    status: 'published',
  })
  await database.collection('memberships').doc('membership-1').set({
    id: 'membership-1',
    memberId: 'member-1',
    coachId: 'coach-1',
    coachName: '教练',
    productId: 'product-1',
    productName: '私教课',
    purchasePriceCents: 100,
    totalLessons: 2,
    availableLessons: 1,
    lockedLessons: 1,
    usedLessons: 0,
    purchasedAt: '2026-07-01T00:00:00.000Z',
  })
  await database.collection('orders').doc('order-1').set({
    id: 'order-1',
    requestId: 'purchase-existing',
    memberId: 'member-1',
    coachId: 'coach-1',
    productId: 'product-1',
    status: 'pending',
  })
  await database.collection('schedules').doc('slot-1').set({
    id: 'slot-1',
    coachId: 'coach-1',
    startsAt: '2026-08-10T10:00:00.000Z',
    endsAt: '2026-08-10T11:00:00.000Z',
    open: true,
    occupiedLessonId: 'lesson-1',
  })
  await database.collection('lessons').doc('lesson-1').set({
    id: 'lesson-1',
    requestId: 'book-existing',
    memberId: 'member-1',
    coachId: 'coach-1',
    membershipPackageId: 'membership-1',
    startsAt: '2026-08-10T10:00:00.000Z',
    endsAt: '2026-08-10T11:00:00.000Z',
    status: 'booked',
    consumedAt: '2026-08-10T11:00:00.000Z',
  })
  await database.collection('appeals').doc('appeal-1').set({
    id: 'appeal-1',
    lessonId: 'lesson-1',
    memberId: 'member-1',
    reason: '测试申诉',
    createdAt: '2026-08-10T12:00:00.000Z',
    status: 'pending',
    lessonRefunded: false,
  })
  await database.collection('ledger').doc('ledger-1').set({
    id: 'ledger-1',
    packageId: 'membership-1',
    operation: 'lock',
    availableDelta: -1,
    lockedDelta: 1,
    usedDelta: 0,
    totalDelta: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
  })
  await database.collection('adminSessions').doc('session-1').set({
    id: 'session-1',
    token: 'admin-token',
    adminId: 'admin-1',
    expiresAt: '2026-08-20T00:00:00.000Z',
  })
  await database.collection('admins').doc('admin-1').set({
    id: 'admin-1',
    username: 'admin',
    passwordHash: 'hash',
  })
  database.queryLog.length = 0
  return database
}

describe('CloudBaseStore', () => {
  it.each([
    ['registerMember', {}, ['users'], 'member-openid', undefined],
    [
      'getSchedule',
      { coachId: 'coach-1', date: '2026-08-10', includeClosed: true },
      ['coaches', 'schedules', 'users', 'lessons'],
      'member-openid',
      undefined,
    ],
    [
      'getCoachScheduleView',
      { coachId: 'coach-1', date: '2026-08-10', includeClosed: true },
      ['coaches', 'schedules', 'users', 'lessons', 'memberships', 'appeals'],
      'member-openid',
      undefined,
    ],
    [
      'getOwnCoachScheduleView',
      { date: '2026-08-10', includeClosed: true, activeRole: 'coach' },
      ['users', 'coaches', 'schedules', 'lessons', 'memberships', 'appeals'],
      'coach-openid',
      undefined,
    ],
    [
      'purchase',
      { productId: 'product-1', coachId: 'coach-1' },
      ['users', 'products', 'coaches', 'orders'],
      'member-openid',
      undefined,
    ],
    [
      'createDevPayment',
      { orderId: 'order-1' },
      ['users', 'orders', 'memberships'],
      'member-openid',
      undefined,
    ],
    [
      'completeLesson',
      { lessonId: 'lesson-1' },
      ['users', 'lessons', 'memberships', 'schedules'],
      'member-openid',
      undefined,
    ],
    [
      'completeLesson',
      { lessonId: 'lesson-1' },
      ['users', 'coaches', 'lessons', 'memberships', 'schedules'],
      'coach-openid',
      undefined,
    ],
    ['saveFeedback', { lessonId: 'lesson-1' }, ['users', 'lessons'], 'member-openid', undefined],
    [
      'createAppeal',
      { lessonId: 'lesson-1' },
      ['users', 'lessons', 'appeals'],
      'member-openid',
      undefined,
    ],
    [
      'setSchedule',
      { date: '2026-08-10', slots: [] },
      ['users', 'coaches', 'schedules'],
      'coach-openid',
      undefined,
    ],
    [
      'coachCancel',
      { lessonId: 'lesson-1', consume: false },
      ['users', 'coaches', 'lessons', 'memberships', 'schedules'],
      'coach-openid',
      undefined,
    ],
    ['adminLogin', { username: 'admin', password: 'password' }, ['admins'], undefined, undefined],
    ['listBookings', {}, ['adminSessions', 'admins', 'lessons'], undefined, 'admin-token'],
    ['listAppeals', {}, ['adminSessions', 'admins', 'appeals'], undefined, 'admin-token'],
    [
      'decideAppeal',
      { appealId: 'appeal-1', decision: 'approve', decisionNote: '同意' },
      ['adminSessions', 'admins', 'appeals', 'lessons', 'memberships'],
      undefined,
      'admin-token',
    ],
    [
      'adjustBalance',
      { packageId: 'membership-1', delta: 1, note: '补课' },
      ['adminSessions', 'admins', 'memberships', 'ledger'],
      undefined,
      'admin-token',
    ],
    [
      'coachLeave',
      { coachId: 'coach-1', transferCoachId: 'coach-2' },
      ['adminSessions', 'admins', 'coaches', 'memberships', 'lessons', 'products'],
      undefined,
      'admin-token',
    ],
    [
      'grantPaidOrder',
      { orderId: 'order-1', paymentId: 'payment-1' },
      ['orders', 'memberships'],
      undefined,
      undefined,
    ],
    [
      '__internalAutoCompleteLessons',
      {},
      ['lessons', 'memberships', 'schedules'],
      undefined,
      undefined,
    ],
  ])('%s 请求不读取无关集合', async (action, payload, expected, openId, authToken) => {
    const database = await seedScopedDatabase()
    const store = new CloudBaseStore(database)

    await store.prepare({
      action,
      requestId: `${action}-scope`,
      payload,
      ...(openId ? { identity: { openId } } : {}),
      ...(authToken ? { authToken } : {}),
    })

    expect(new Set(database.queryLog)).toEqual(new Set(expected))
  })

  it('只查询当前请求需要的集合和记录', async () => {
    const database = new FakeDatabase()
    await database.collection('products').doc('published-product').set({
      id: 'published-product',
      name: '已上架课包',
      status: 'published',
    })
    await database.collection('products').doc('unpublished-product').set({
      id: 'unpublished-product',
      name: '已下架课包',
      status: 'unpublished',
    })
    await database
      .collection('users')
      .doc('member-1')
      .set({
        id: 'member-1',
        openId: 'openid-1',
        name: '不应读取的会员',
        roles: ['member'],
      })
    database.queryLog.length = 0
    const store = new CloudBaseStore(database)
    const prepare = (
      store as CloudBaseStore & {
        prepare?: (request: {
          action: string
          requestId: string
          payload: Record<string, unknown>
        }) => Promise<void>
      }
    ).prepare

    expect(prepare).toBeTypeOf('function')
    if (!prepare) return
    await prepare.call(store, {
      action: 'listPackages',
      requestId: 'list-packages',
      payload: {},
    })

    expect(store.products.map((item) => item.id)).toEqual(['published-product'])
    expect(database.queryLog).toEqual(['products'])
  })

  it('教练列表不读取其他业务集合', async () => {
    const database = new FakeDatabase()
    await database.collection('coaches').doc('active-coach').set({
      id: 'active-coach',
      name: '在岗教练',
      status: 'active',
    })
    await database.collection('coaches').doc('inactive-coach').set({
      id: 'inactive-coach',
      name: '离职教练',
      status: 'inactive',
    })
    database.queryLog.length = 0
    const store = new CloudBaseStore(database)

    await store.prepare({
      action: 'listCoaches',
      requestId: 'list-coaches',
      payload: {},
    })

    expect(store.coaches.map((item) => item.id)).toEqual(['active-coach'])
    expect(database.queryLog).toEqual(['coaches'])
  })

  it('课包状态事务只读取和写入管理员身份及目标课包', async () => {
    const database = new FakeDatabase()
    await database.collection('adminSessions').doc('session-1').set({
      id: 'session-1',
      token: 'admin-token',
      adminId: 'admin-1',
      expiresAt: '2026-08-04T00:00:00.000Z',
    })
    await database.collection('admins').doc('admin-1').set({
      id: 'admin-1',
      username: 'admin',
      passwordHash: 'hash',
    })
    await database.collection('products').doc('legacy-product').set({
      id: 'legacy-product',
      name: '旧课包',
      priceCents: 100,
      lessonCount: 1,
      coachId: 'coach-1',
    })
    await database.collection('lessons').doc('lesson-1').set({
      id: 'lesson-1',
      status: 'booked',
    })
    database.queryLog.length = 0
    const store = new CloudBaseStore(database)

    await store.prepare({
      action: 'adminCrud',
      requestId: 'publish-product',
      authToken: 'admin-token',
      payload: {
        resource: 'packages',
        operation: 'setStatus',
        data: { id: 'legacy-product', status: 'published' },
      },
    })
    expect(database.documentReadLog).toContain('products/legacy-product')
    await store.transaction(() => {
      const product = store.products[0]
      if (!product) throw new Error('课包不存在')
      product.status = 'published'
    })

    expect(new Set(database.queryLog)).toEqual(new Set(['adminSessions', 'admins', 'products']))
    expect(database.queryLog).not.toContain('system_locks')
    expect((await database.collection('products').doc('legacy-product').get()).data).toMatchObject({
      status: 'published',
    })
  })

  it('后台课包页只读取身份、课包、教练和销量所需订单', async () => {
    const database = new FakeDatabase()
    await database.collection('adminSessions').doc('session-1').set({
      id: 'session-1',
      token: 'admin-token',
      adminId: 'admin-1',
      expiresAt: '2026-08-04T00:00:00.000Z',
    })
    await database.collection('admins').doc('admin-1').set({
      id: 'admin-1',
      username: 'admin',
      passwordHash: 'hash',
    })
    database.queryLog.length = 0
    const store = new CloudBaseStore(database)

    await store.prepare({
      action: 'adminPage',
      requestId: 'products-page',
      authToken: 'admin-token',
      payload: { page: 'products' },
    })

    expect(new Set(database.queryLog)).toEqual(
      new Set(['adminSessions', 'admins', 'products', 'coaches', 'orders']),
    )
  })

  it.each([
    [
      'dashboard',
      [
        'adminSessions',
        'admins',
        'lessons',
        'appeals',
        'orders',
        'users',
        'coaches',
        'memberships',
        'ledger',
      ],
    ],
    [
      'coaches',
      ['adminSessions', 'admins', 'coaches', 'users', 'memberships', 'lessons', 'schedules'],
    ],
    [
      'members',
      [
        'adminSessions',
        'admins',
        'users',
        'coaches',
        'memberships',
        'lessons',
        'orders',
        'ledger',
        'appeals',
      ],
    ],
    [
      'bookings',
      [
        'adminSessions',
        'admins',
        'lessons',
        'users',
        'coaches',
        'memberships',
        'ledger',
        'appeals',
      ],
    ],
    [
      'appeals',
      [
        'adminSessions',
        'admins',
        'appeals',
        'lessons',
        'users',
        'coaches',
        'memberships',
        'ledger',
      ],
    ],
  ])('后台 %s 页不读取无关集合', async (page, expectedCollections) => {
    const database = new FakeDatabase()
    await database.collection('adminSessions').doc('session-1').set({
      id: 'session-1',
      token: 'admin-token',
      adminId: 'admin-1',
      expiresAt: '2026-08-04T00:00:00.000Z',
    })
    await database.collection('admins').doc('admin-1').set({
      id: 'admin-1',
      username: 'admin',
      passwordHash: 'hash',
    })
    database.queryLog.length = 0
    const store = new CloudBaseStore(database)

    await store.prepare({
      action: 'adminPage',
      requestId: `${page}-page`,
      authToken: 'admin-token',
      payload: { page },
    })

    expect(new Set(database.queryLog)).toEqual(new Set(expectedCollections))
  })

  it('游客进入小程序只读取用户、上架课包和在岗教练', async () => {
    const database = new FakeDatabase()
    database.queryLog.length = 0
    const store = new CloudBaseStore(database)

    await store.prepare({
      action: 'bootstrap',
      requestId: 'guest-bootstrap',
      identity: { openId: 'unknown-openid' },
      payload: {},
    })

    expect(new Set(database.queryLog)).toEqual(new Set(['users', 'products', 'coaches']))
  })

  it('会员进入小程序不读取后台、排班和流水集合', async () => {
    const database = new FakeDatabase()
    await database
      .collection('users')
      .doc('member-1')
      .set({
        id: 'member-1',
        openId: 'member-openid',
        name: '会员',
        roles: ['member'],
      })
    database.queryLog.length = 0
    const store = new CloudBaseStore(database)

    await store.prepare({
      action: 'bootstrap',
      requestId: 'member-bootstrap',
      identity: { openId: 'member-openid' },
      payload: {},
    })

    expect(new Set(database.queryLog)).toEqual(
      new Set(['users', 'products', 'coaches', 'memberships', 'lessons', 'appeals', 'orders']),
    )
  })

  it('教练首页只加载自己课程涉及的会员资料', async () => {
    const database = await seedScopedDatabase()
    const store = new CloudBaseStore(database)

    await store.prepare({
      action: 'bootstrap',
      requestId: 'coach-bootstrap',
      identity: { openId: 'coach-openid' },
      payload: { activeRole: 'coach' },
    })

    expect(store.users.map((item) => item.id).sort()).toEqual(['coach-user-1', 'member-1'])
    expect(store.appeals.map((item) => item.lessonId)).toEqual(['lesson-1'])
  })

  it.each([
    ['session', {}, ['users'], 'member-openid'],
    ['memberHome', {}, ['users', 'products', 'coaches', 'memberships', 'lessons'], 'member-openid'],
    [
      'memberLessons',
      {},
      ['users', 'coaches', 'memberships', 'lessons', 'appeals'],
      'member-openid',
    ],
    [
      'lessonDetail',
      { lessonId: 'lesson-1' },
      ['users', 'coaches', 'memberships', 'lessons', 'appeals'],
      'member-openid',
    ],
    [
      'coachDashboard',
      { date: '2026-08-10', activeRole: 'coach' },
      ['users', 'coaches', 'memberships', 'lessons', 'appeals'],
      'coach-openid',
    ],
    ['purchase', { orderId: 'order-1' }, ['users', 'orders', 'memberships'], 'member-openid'],
  ])('bootstrap %s 视图只读取页面需要的集合', async (view, context, expected, openId) => {
    const database = await seedScopedDatabase()
    const store = new CloudBaseStore(database)

    await store.prepare({
      action: 'bootstrap',
      requestId: `bootstrap-${view}`,
      identity: { openId },
      payload: { view, ...context },
    })

    expect(new Set(database.queryLog)).toEqual(new Set(expected))
  })

  it('预约只读取目标会员、教练、课包、时段和冲突课程', async () => {
    const database = new FakeDatabase()
    await database
      .collection('users')
      .doc('member-1')
      .set({
        id: 'member-1',
        openId: 'member-openid',
        name: '会员',
        roles: ['member'],
      })
    await database.collection('coaches').doc('coach-1').set({
      id: 'coach-1',
      name: '教练',
      status: 'active',
    })
    await database.collection('memberships').doc('membership-1').set({
      id: 'membership-1',
      memberId: 'member-1',
      coachId: 'coach-1',
      coachName: '教练',
      productId: 'product-1',
      productName: '私教课',
      purchasePriceCents: 100,
      totalLessons: 1,
      availableLessons: 1,
      lockedLessons: 0,
      usedLessons: 0,
      purchasedAt: '2026-07-01T00:00:00.000Z',
    })
    await database.collection('schedules').doc('slot-1').set({
      id: 'slot-1',
      coachId: 'coach-1',
      startsAt: '2026-08-10T10:00:00.000Z',
      endsAt: '2026-08-10T11:00:00.000Z',
      open: true,
    })
    database.queryLog.length = 0
    const store = new CloudBaseStore(database)
    const request = {
      action: 'bookLesson',
      requestId: 'book-scoped',
      identity: { openId: 'member-openid' },
      payload: {
        coachId: 'coach-1',
        packageId: 'membership-1',
        startsAt: '2026-08-10T10:00:00.000Z',
      },
    }
    await store.prepare(request)

    const response = await createRouter(
      store,
      { developmentPaymentsEnabled: false, production: true },
      () => '2026-08-01T00:00:00.000Z',
    )(request)

    expect(response).toMatchObject({ ok: true, data: { status: 'booked' } })
    expect(new Set(database.queryLog)).toEqual(
      new Set(['users', 'coaches', 'memberships', 'schedules', 'lessons']),
    )
    expect(database.queryLog).not.toContain('system_locks')
    expect(database.collections.get('lessons')?.size).toBe(1)
    expect((await database.collection('schedules').doc('slot-1').get()).data).toMatchObject({
      occupiedLessonId: expect.any(String),
    })
  })

  it('会员取消只读取目标课程和关联课包并释放时段', async () => {
    const database = new FakeDatabase()
    await database
      .collection('users')
      .doc('member-1')
      .set({
        id: 'member-1',
        openId: 'member-openid',
        name: '会员',
        roles: ['member'],
      })
    await database.collection('memberships').doc('membership-1').set({
      id: 'membership-1',
      memberId: 'member-1',
      coachId: 'coach-1',
      coachName: '教练',
      productId: 'product-1',
      productName: '私教课',
      purchasePriceCents: 100,
      totalLessons: 1,
      availableLessons: 0,
      lockedLessons: 1,
      usedLessons: 0,
      purchasedAt: '2026-07-01T00:00:00.000Z',
    })
    await database.collection('lessons').doc('lesson-1').set({
      id: 'lesson-1',
      requestId: 'book-1',
      memberId: 'member-1',
      coachId: 'coach-1',
      membershipPackageId: 'membership-1',
      startsAt: '2026-08-10T10:00:00.000Z',
      endsAt: '2026-08-10T11:00:00.000Z',
      status: 'booked',
    })
    await database.collection('schedules').doc('slot-1').set({
      id: 'slot-1',
      coachId: 'coach-1',
      startsAt: '2026-08-10T10:00:00.000Z',
      endsAt: '2026-08-10T11:00:00.000Z',
      open: true,
      occupiedLessonId: 'lesson-1',
    })
    database.queryLog.length = 0
    const store = new CloudBaseStore(database)
    const request = {
      action: 'cancelLesson',
      requestId: 'cancel-scoped',
      identity: { openId: 'member-openid' },
      payload: { lessonId: 'lesson-1' },
    }
    await store.prepare(request)

    const response = await createRouter(
      store,
      { developmentPaymentsEnabled: false, production: true },
      () => '2026-08-01T00:00:00.000Z',
    )(request)

    expect(response).toMatchObject({ ok: true, data: { status: 'member_cancelled' } })
    expect(new Set(database.queryLog)).toEqual(
      new Set(['users', 'lessons', 'memberships', 'schedules']),
    )
    expect((await database.collection('schedules').doc('slot-1').get()).data).not.toHaveProperty(
      'occupiedLessonId',
    )
  })

  it('兼容没有 structuredClone 的云函数运行环境', async () => {
    const runtime = globalThis as unknown as {
      structuredClone?: (value: unknown) => unknown
    }
    const nativeStructuredClone = runtime.structuredClone
    delete runtime.structuredClone

    try {
      const database = new FakeDatabase()
      await database
        .collection('users')
        .doc('member-1')
        .set({
          id: 'member-1',
          openId: 'openid-1',
          name: '会员',
          roles: ['member'],
        })
      const store = new CloudBaseStore(database)

      await store.prepare({
        action: 'registerMember',
        requestId: 'update-member',
        identity: { openId: 'openid-1' },
        payload: {},
      })
      await store.transaction(() => {
        const member = store.users[0]
        if (!member) throw new Error('会员不存在')
        member.name = '新姓名'
      })

      expect((await database.collection('users').doc('member-1').get()).data).toMatchObject({
        name: '新姓名',
      })
    } finally {
      runtime.structuredClone = nativeStructuredClone
    }
  })

  it('事务内依次读取集合，避免 CloudBase TransactionBusy', async () => {
    const store = new CloudBaseStore(new TransactionBusyDatabase())
    await store.prepare({
      action: 'adminLogin',
      requestId: 'admin-login',
      payload: { username: 'admin' },
    })

    await expect(store.transaction(() => undefined)).resolves.toBeUndefined()
  })

  it('精准查询仍会分页读取超过100条匹配记录', async () => {
    const database = new FakeDatabase()
    const products = database.collection('products')
    for (let index = 0; index < 205; index += 1) {
      await products.doc(`product-${index}`).set({
        id: `product-${index}`,
        name: `课包${index}`,
        status: 'published',
      })
    }
    const store = new CloudBaseStore(database)

    await store.prepare({
      action: 'listPackages',
      requestId: 'list-many-products',
      payload: {},
    })

    expect(store.products).toHaveLength(205)
    expect(store.products.at(-1)?.id).toBe('product-204')
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
    await store.prepare({
      action: 'registerMember',
      requestId: 'rollback-member',
      identity: { openId: 'openid-1' },
      payload: {},
    })

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
        .collection('users')
        .doc(memberId)
        .set({
          id: memberId,
          openId: `openid-${memberId}`,
          name: memberId,
          roles: ['member'],
        })
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
    await Promise.all([
      firstStore.prepare({
        action: 'bookLesson',
        requestId: 'book-member-1',
        identity: { openId: 'openid-member-1' },
        payload: {
          coachId: 'coach-1',
          packageId: 'package-member-1',
          startsAt: '2026-08-01T10:00:00.000Z',
        },
      }),
      secondStore.prepare({
        action: 'bookLesson',
        requestId: 'book-member-2',
        identity: { openId: 'openid-member-2' },
        payload: {
          coachId: 'coach-1',
          packageId: 'package-member-2',
          startsAt: '2026-08-01T10:00:00.000Z',
        },
      }),
    ])

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
    expect(database.collections.get('lessons')?.size).toBe(1)
    const memberships = [...(database.collections.get('memberships')?.values() ?? [])]
    expect(memberships.reduce((sum, item) => sum + Number(item.lockedLessons), 0)).toBe(1)
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
