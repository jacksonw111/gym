import { describe, expect, it, vi } from 'vitest'
import { createGymHandler, createRouter } from './index'
import { createDevelopmentSeed } from './seed'
import { MemoryStore } from './store'

describe('gym action router', () => {
  it('未知 action 返回统一中文错误', async () => {
    const router = createRouter(new MemoryStore(), {
      developmentPaymentsEnabled: false,
      production: true,
    })

    await expect(
      router({ action: 'doesNotExist', requestId: 'request-1', payload: {} }),
    ).resolves.toEqual({
      ok: false,
      error: { code: 'UNKNOWN_ACTION', message: '不支持的操作：doesNotExist' },
    })
  })

  it('bootstrap 从服务端微信 identity 解析当前会员', async () => {
    const seed = createDevelopmentSeed()
    seed.orders = [
      {
        id: 'order-bootstrap-1',
        requestId: 'purchase-bootstrap-1',
        memberId: 'member-1',
        coachId: 'coach-1',
        coachName: '示例教练',
        productId: 'product-1',
        productSnapshot: {
          id: 'product-1',
          name: '十节私教课',
          priceCents: 5_000,
          lessonCount: 10,
        },
        status: 'paid',
        createdAt: '2026-07-01T00:00:00.000Z',
        packageId: 'membership-1',
      },
    ]
    const store = new MemoryStore(seed)
    const router = createRouter(store, {
      developmentPaymentsEnabled: true,
      production: false,
    })

    const response = await router({
      action: 'bootstrap',
      requestId: 'bootstrap-1',
      payload: {},
      identity: { emasUserId: 'dev-member-openid' },
    })

    expect(response).toMatchObject({
      ok: true,
      data: {
        actor: { kind: 'member', id: 'member-1' },
        profile: { id: 'member-1' },
        roles: ['member'],
        activeRole: 'member',
        packages: [{ id: 'product-1' }],
        coaches: [{ id: 'coach-1' }],
        memberships: [],
        lessons: [],
        appeals: [],
        orders: [
          {
            id: 'order-bootstrap-1',
            status: 'paid',
            membershipId: 'membership-1',
          },
        ],
        coach: { schedule: [], lessons: [] },
      },
    })
  })

  it('bootstrap 让首次进入的真实微信用户保持游客且不写入会员', async () => {
    const store = new MemoryStore(createDevelopmentSeed())
    const router = createRouter(store, {
      developmentPaymentsEnabled: false,
      production: true,
    })
    const response = await router({
      action: 'bootstrap',
      requestId: 'bootstrap-guest',
      payload: {},
      identity: { emasUserId: 'guest-openid' },
    })

    expect(response).toMatchObject({
      ok: true,
      data: {
        authenticated: false,
        actor: null,
        profile: null,
        roles: [],
        activeRole: null,
        packages: [{ id: 'product-1' }],
        coaches: [{ id: 'coach-1' }],
        memberships: [],
        lessons: [],
        appeals: [],
        orders: [],
        coach: { schedule: [], lessons: [] },
      },
    })
    expect(store.users.some((item) => item.emasUserId === 'guest-openid')).toBe(false)
  })

  it('registerMember 只创建一个真实会员并允许重复授权更新', async () => {
    const store = new MemoryStore(createDevelopmentSeed())
    const resolvePhoneNumber = vi.fn(async () => '13800000000')
    const router = createRouter(store, {
      developmentPaymentsEnabled: false,
      production: true,
      resolvePhoneNumber,
    })
    const request = {
      action: 'registerMember',
      requestId: 'register-1',
      payload: {
        name: '陈澄',
        avatarUrl: 'https://storage.example/avatar/member.jpg',
        phoneCode: 'phone-code',
      },
      identity: { emasUserId: 'registered-openid' },
    }

    const first = await router(request)
    expect(first).toMatchObject({
      ok: true,
      data: {
        name: '陈澄',
        avatarUrl: 'https://storage.example/avatar/member.jpg',
        phone: '13800000000',
        roles: ['member'],
      },
    })

    const second = await router({
      ...request,
      requestId: 'register-2',
      payload: { ...request.payload, name: '陈澄新昵称' },
    })

    expect(second).toMatchObject({
      ok: true,
      data: { name: '陈澄新昵称', phone: '13800000000' },
    })
    expect(store.users.filter((user) => user.emasUserId === 'registered-openid')).toHaveLength(1)
    expect(resolvePhoneNumber).toHaveBeenCalledTimes(2)
  })

  it('registerMember 接受用户手动填写的手机号并标记为未验证', async () => {
    const store = new MemoryStore(createDevelopmentSeed())
    const router = createRouter(store, {
      developmentPaymentsEnabled: false,
      production: true,
    })

    const response = await router({
      action: 'registerMember',
      requestId: 'register-manual-phone',
      payload: {
        name: '手动填写会员',
        avatarUrl: 'https://storage.example/avatar/manual.jpg',
        phone: '13800000000',
      },
      identity: { emasUserId: 'manual-phone-openid' },
    })

    expect(response).toMatchObject({
      ok: true,
      data: {
        phone: '13800000000',
        phoneVerified: false,
      },
    })
  })

  it('getSchedule 为真实教练日期首次访问创建默认开放的十一个时段', async () => {
    const store = new MemoryStore(createDevelopmentSeed())
    const router = createRouter(store, {
      developmentPaymentsEnabled: false,
      production: true,
    })

    const response = await router({
      action: 'getSchedule',
      requestId: 'schedule-defaults',
      payload: { coachId: 'coach-1', date: '2026-09-01', includeClosed: true },
      identity: { emasUserId: 'dev-member-openid' },
    })

    if (!response.ok) throw new Error('排班读取失败')
    expect(response.data).toHaveLength(11)
    expect(response.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          coachId: 'coach-1',
          startsAt: '2026-09-01T10:00:00+08:00',
          endsAt: '2026-09-01T11:00:00+08:00',
          open: true,
        }),
      ]),
    )
    expect(response.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          startsAt: '2026-09-01T20:00:00+08:00',
          endsAt: '2026-09-01T21:00:00+08:00',
        }),
      ]),
    )
    expect(
      store.schedules.filter(
        (item) => item.coachId === 'coach-1' && item.startsAt.startsWith('2026-09-01'),
      ),
    ).toHaveLength(11)
  })

  it('云入口忽略客户端伪造 identity，只采用服务端解析结果', async () => {
    const store = new MemoryStore(createDevelopmentSeed())
    const handler = createGymHandler(
      store,
      { developmentPaymentsEnabled: true, production: false },
      () => ({ emasUserId: 'dev-member-openid' }),
    )

    const response = await handler({
      action: 'bootstrap',
      requestId: 'bootstrap-server-identity',
      payload: {},
      identity: { emasUserId: 'forged-openid' },
    })

    expect(response).toMatchObject({
      ok: true,
      data: { profile: { id: 'member-1' } },
    })
  })

  it('bootstrap 为教练身份返回自己的排班、课程和相关申诉', async () => {
    const seed = createDevelopmentSeed()
    const member = seed.users?.find((item) => item.id === 'member-1')
    if (!member) throw new Error('测试种子缺失')
    member.phone = '13800000000'
    seed.lessons = [
      {
        id: 'lesson-coach-1',
        requestId: 'book-coach-1',
        memberId: 'member-1',
        coachId: 'coach-1',
        membershipPackageId: 'package-1',
        startsAt: '2026-07-20T10:00:00.000Z',
        endsAt: '2026-07-20T11:00:00.000Z',
        status: 'completed',
        completionSource: 'member',
        consumedAt: '2026-07-20T11:00:00.000Z',
      },
    ]
    seed.appeals = [
      {
        id: 'appeal-coach-1',
        lessonId: 'lesson-coach-1',
        memberId: 'member-1',
        reason: '课程异常',
        createdAt: '2026-07-21T11:00:00.000Z',
        status: 'pending',
        lessonRefunded: false,
      },
    ]
    const router = createRouter(new MemoryStore(seed), {
      developmentPaymentsEnabled: true,
      production: false,
    })

    const response = await router({
      action: 'bootstrap',
      requestId: 'bootstrap-coach',
      payload: { activeRole: 'coach' },
      identity: { emasUserId: 'dev-coach-openid' },
    })

    expect(response).toMatchObject({
      ok: true,
      data: {
        actor: { kind: 'coach', id: 'coach-1' },
        activeRole: 'coach',
        lessons: [
          {
            id: 'lesson-coach-1',
            memberName: '示例会员',
            memberPhone: '13800000000',
          },
        ],
        appeals: [{ id: 'appeal-coach-1' }],
        coach: {
          schedule: [{ id: 'slot-1' }],
          lessons: [
            {
              id: 'lesson-coach-1',
              memberName: '示例会员',
              memberPhone: '13800000000',
            },
          ],
        },
      },
    })
  })

  it('关键会员动作通过 identity 限定本人并完成购买、开发支付和预约', async () => {
    const store = new MemoryStore(createDevelopmentSeed())
    const router = createRouter(store, {
      developmentPaymentsEnabled: true,
      production: false,
      createPaymentParameters: async (order) => ({
        orderId: order.id,
        payment: {
          timeStamp: '1722326400',
          nonceStr: 'nonce',
          package: 'prepay_id=wx-prepay',
          signType: 'RSA',
          paySign: 'server-signature',
        },
      }),
    })
    const identity = { emasUserId: 'dev-member-openid' }
    const purchased = await router({
      action: 'purchase',
      requestId: 'purchase-1',
      payload: { productId: 'product-1', coachId: 'coach-1' },
      identity,
    })
    expect(purchased.ok).toBe(true)
    if (!purchased.ok) throw new Error('购买失败')
    expect(purchased.data).toMatchObject({
      order: { status: 'pending' },
      payment: { package: 'prepay_id=wx-prepay', signType: 'RSA' },
    })
    const orderId = (purchased.data as { order: { id: string } }).order.id

    const paid = await router({
      action: 'createDevPayment',
      requestId: 'payment-1',
      payload: { orderId },
      identity,
    })
    expect(paid.ok).toBe(true)
    if (!paid.ok) throw new Error('支付失败')
    const packageId = (paid.data as { id: string }).id

    const booked = await router({
      action: 'bookLesson',
      requestId: 'book-1',
      payload: {
        coachId: 'coach-1',
        packageId,
        startsAt: '2026-08-01T10:00:00.000Z',
      },
      identity,
    })
    expect(booked).toMatchObject({ ok: true, data: { memberId: 'member-1', status: 'booked' } })
  })

  it('getSchedule标记他人占用但不泄露会员资料，只给本人课程id', async () => {
    const seed = createDevelopmentSeed()
    seed.users?.push({
      id: 'member-2',
      emasUserId: 'openid-member-2',
      name: '其他会员',
      phone: '13900000000',
      roles: ['member'],
    })
    seed.lessons = [
      {
        id: 'lesson-occupied',
        requestId: 'book-occupied',
        memberId: 'member-2',
        coachId: 'coach-1',
        membershipPackageId: 'package-2',
        startsAt: '2026-08-01T10:00:00.000Z',
        endsAt: '2026-08-01T11:00:00.000Z',
        status: 'booked',
      },
    ]
    const router = createRouter(new MemoryStore(seed), {
      developmentPaymentsEnabled: true,
      production: false,
    })

    const response = await router({
      action: 'getSchedule',
      requestId: 'schedule-safe-occupancy',
      payload: { coachId: 'coach-1' },
      identity: { emasUserId: 'dev-member-openid' },
    })

    expect(response).toEqual({
      ok: true,
      data: [
        {
          id: 'slot-1',
          coachId: 'coach-1',
          startsAt: '2026-08-01T10:00:00.000Z',
          endsAt: '2026-08-01T11:00:00.000Z',
          open: true,
          occupied: true,
        },
      ],
    })
    expect(JSON.stringify(response)).not.toContain('其他会员')
    expect(JSON.stringify(response)).not.toContain('13900000000')
    expect(JSON.stringify(response)).not.toContain('lesson-occupied')
  })

  it('管理员 action 必须验证会话，登录后才能查看申诉', async () => {
    const store = new MemoryStore(createDevelopmentSeed())
    const router = createRouter(store, {
      developmentPaymentsEnabled: true,
      production: false,
    })

    const denied = await router({
      action: 'listAppeals',
      requestId: 'appeals-1',
      payload: {},
      authToken: 'invalid',
    })
    expect(denied).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } })

    const login = await router({
      action: 'adminLogin',
      requestId: 'login-1',
      payload: { username: 'admin', password: 'dev-admin-password' },
    })
    expect(login.ok).toBe(true)
    if (!login.ok) throw new Error('登录失败')
    const token = (login.data as { token: string }).token

    const allowed = await router({
      action: 'listAppeals',
      requestId: 'appeals-2',
      payload: {},
      authToken: token,
    })
    expect(allowed).toEqual({ ok: true, data: [] })

    const dashboard = await router({
      action: 'adminCrud',
      requestId: 'dashboard-1',
      payload: { resource: 'dashboard', operation: 'list' },
      authToken: token,
    })
    expect(dashboard).toMatchObject({
      ok: true,
      data: {
        coaches: [{ id: 'coach-1' }],
        members: [{ id: 'member-1' }],
        packages: [{ id: 'product-1' }],
        memberships: [],
        bookings: [],
        appeals: [],
        orders: [],
        ledger: [],
        schedules: [{ id: 'slot-1' }],
      },
    })

    const savedCoach = await router({
      action: 'adminCrud',
      requestId: 'coach-save-1',
      payload: {
        resource: 'coaches',
        operation: 'save',
        data: {
          userId: 'member-1',
          name: '新教练',
          status: 'active',
        },
      },
      authToken: token,
    })
    expect(savedCoach).toMatchObject({
      ok: true,
      data: { id: expect.any(String), name: '新教练', status: 'active' },
    })

    const missingCoach = await router({
      action: 'adminCrud',
      requestId: 'coach-missing-1',
      payload: {
        resource: 'coaches',
        operation: 'get',
        data: { id: 'missing-coach' },
      },
      authToken: token,
    })
    expect(missingCoach).toEqual({
      ok: false,
      error: { code: 'DOMAIN_ERROR', message: '记录不存在' },
    })
  })

  it('管理员新增教练时绑定真实小程序用户并授予教练角色', async () => {
    const store = new MemoryStore(createDevelopmentSeed())
    const router = createRouter(store, {
      developmentPaymentsEnabled: false,
      production: true,
    })
    const login = await router({
      action: 'adminLogin',
      requestId: 'admin-login-for-coach',
      payload: { username: 'admin', password: 'dev-admin-password' },
    })
    if (!login.ok) throw new Error('管理员登录失败')
    const token = (login.data as { token: string }).token

    const response = await router({
      action: 'adminCrud',
      requestId: 'admin-create-coach',
      authToken: token,
      payload: {
        resource: 'coaches',
        operation: 'save',
        data: {
          userId: 'member-1',
          name: '新教练',
          phone: '13800000001',
          specialty: '体能训练',
        },
      },
    })

    expect(response).toMatchObject({
      ok: true,
      data: {
        userId: 'member-1',
        name: '新教练',
        status: 'active',
      },
    })
    expect(store.users.find((item) => item.id === 'member-1')?.roles).toContain('coach')
    expect(store.coaches.filter((item) => item.userId === 'member-1')).toHaveLength(1)
  })

  it('管理员可以创建不绑定小程序账号的教练', async () => {
    const store = new MemoryStore(createDevelopmentSeed())
    const router = createRouter(store, {
      developmentPaymentsEnabled: false,
      production: true,
    })
    const login = await router({
      action: 'adminLogin',
      requestId: 'admin-login-unbound-coach',
      payload: { username: 'admin', password: 'dev-admin-password' },
    })
    if (!login.ok) throw new Error('管理员登录失败')
    const token = (login.data as { token: string }).token

    const response = await router({
      action: 'adminCrud',
      requestId: 'admin-create-unbound-coach',
      authToken: token,
      payload: {
        resource: 'coaches',
        operation: 'save',
        data: {
          name: '独立教练',
          phone: '13800000002',
          specialty: '拳击',
        },
      },
    })

    expect(response).toMatchObject({
      ok: true,
      data: { name: '独立教练', status: 'active' },
    })
    const created = store.coaches.find((item) => item.name === '独立教练')
    expect(created?.userId).toBeUndefined()
  })

  it('管理员保存课时包时必须绑定已有教练', async () => {
    const store = new MemoryStore(createDevelopmentSeed())
    const router = createRouter(store, {
      developmentPaymentsEnabled: false,
      production: true,
    })
    const login = await router({
      action: 'adminLogin',
      requestId: 'admin-login-package-coach',
      payload: { username: 'admin', password: 'dev-admin-password' },
    })
    if (!login.ok) throw new Error('管理员登录失败')
    const token = (login.data as { token: string }).token

    const missingCoach = await router({
      action: 'adminCrud',
      requestId: 'admin-save-package-no-coach',
      authToken: token,
      payload: {
        resource: 'packages',
        operation: 'save',
        data: { name: '五节体验课', priceCents: 2_000, lessonCount: 5, status: 'published' },
      },
    })
    expect(missingCoach).toEqual({
      ok: false,
      error: { code: 'DOMAIN_ERROR', message: '课时包必须绑定教练' },
    })

    const unknownCoach = await router({
      action: 'adminCrud',
      requestId: 'admin-save-package-bad-coach',
      authToken: token,
      payload: {
        resource: 'packages',
        operation: 'save',
        data: {
          name: '五节体验课',
          priceCents: 2_000,
          lessonCount: 5,
          coachId: 'coach-missing',
          status: 'published',
        },
      },
    })
    expect(unknownCoach).toEqual({
      ok: false,
      error: { code: 'DOMAIN_ERROR', message: '绑定的教练不存在' },
    })

    const saved = await router({
      action: 'adminCrud',
      requestId: 'admin-save-package-with-coach',
      authToken: token,
      payload: {
        resource: 'packages',
        operation: 'save',
        data: {
          name: '五节体验课',
          priceCents: 2_000,
          lessonCount: 5,
          coachId: 'coach-1',
          status: 'published',
        },
      },
    })
    expect(saved).toMatchObject({
      ok: true,
      data: { name: '五节体验课', coachId: 'coach-1' },
    })
  })

  it('购买绑定教练的课时包时使用课时包绑定的教练', async () => {
    const store = new MemoryStore(createDevelopmentSeed())
    const router = createRouter(store, {
      developmentPaymentsEnabled: true,
      production: false,
    })

    const purchased = await router({
      action: 'purchase',
      requestId: 'purchase-bound-coach',
      payload: { productId: 'product-1' },
      identity: { emasUserId: 'dev-member-openid' },
    })

    expect(purchased).toMatchObject({
      ok: true,
      data: { order: { coachId: 'coach-1', productId: 'product-1' } },
    })
  })

  it('教练修改开放时间时更新已有时段而不是重复新增', async () => {
    const store = new MemoryStore(createDevelopmentSeed())
    const router = createRouter(store, {
      developmentPaymentsEnabled: false,
      production: true,
    })
    const identity = { emasUserId: 'dev-coach-openid' }

    await router({
      action: 'getSchedule',
      requestId: 'schedule-defaults',
      payload: { coachId: 'coach-1', date: '2026-08-03', includeClosed: true },
      identity,
    })
    const startsAt = '2026-08-03T10:00:00+08:00'
    const endsAt = '2026-08-03T11:00:00+08:00'

    await router({
      action: 'setSchedule',
      requestId: 'schedule-close',
      payload: {
        date: '2026-08-03',
        slots: [{ startsAt, endsAt, open: false }],
      },
      identity,
    })
    await router({
      action: 'setSchedule',
      requestId: 'schedule-reopen',
      payload: {
        date: '2026-08-03',
        slots: [{ startsAt, endsAt, open: true }],
      },
      identity,
    })

    const daySlots = store.schedules.filter(
      (slot) => slot.coachId === 'coach-1' && slot.startsAt.startsWith('2026-08-03'),
    )
    expect(daySlots).toHaveLength(11)
    expect(daySlots.find((slot) => slot.startsAt === startsAt)).toMatchObject({
      id: 'slot-coach-1-2026-08-03-10',
      open: true,
    })
  })

  it.each([
    ['缺少coach角色', ['member'] as const, 'active' as const],
    ['教练已停用', ['coach'] as const, 'inactive' as const],
  ])('拒绝%s的账号设置排班', async (_label, roles, status) => {
    const seed = createDevelopmentSeed()
    const coachUser = seed.users?.find((item) => item.id === 'coach-user-1')
    const seededCoach = seed.coaches?.find((item) => item.id === 'coach-1')
    if (!coachUser || !seededCoach) throw new Error('测试种子缺失')
    coachUser.roles = [...roles]
    seededCoach.status = status
    const router = createRouter(new MemoryStore(seed), {
      developmentPaymentsEnabled: true,
      production: false,
    })

    const response = await router({
      action: 'setSchedule',
      requestId: `schedule-${_label}`,
      payload: { slots: [] },
      identity: { emasUserId: coachUser.emasUserId },
    })

    expect(response).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } })
  })

  it('returns a test-payment order and settles it only when development payment is enabled', async () => {
    const store = new MemoryStore(createDevelopmentSeed())
    const router = createRouter(store, {
      developmentPaymentsEnabled: true,
      production: false,
    })

    const purchase = await router({
      action: 'purchase',
      requestId: 'test-cloud-purchase',
      payload: { productId: 'product-1', coachId: 'coach-1' },
      identity: { emasUserId: 'dev-member-openid' },
    })
    expect(purchase).toMatchObject({
      ok: true,
      data: { order: { status: 'pending' }, testPayment: true },
    })

    const orderId =
      purchase.ok && purchase.data && typeof purchase.data === 'object' && 'order' in purchase.data
        ? (purchase.data.order as { id: string }).id
        : ''
    const paid = await router({
      action: 'createDevPayment',
      requestId: 'settle-test-cloud-purchase',
      payload: { orderId },
      identity: { emasUserId: 'dev-member-openid' },
    })
    expect(paid).toMatchObject({ ok: true, data: { memberId: 'member-1' } })
  })

  it('未知运行时错误只返回通用中文并记录服务端详情', async () => {
    const store = new MemoryStore(createDevelopmentSeed())
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const router = createRouter(store, {
      developmentPaymentsEnabled: false,
      production: true,
      createPaymentParameters: async () => {
        throw new Error('ECONNRESET payment-secret')
      },
    })

    const response = await router({
      action: 'purchase',
      requestId: 'purchase-network-failure',
      payload: { productId: 'product-1', coachId: 'coach-1' },
      identity: { emasUserId: 'dev-member-openid' },
    })

    expect(response).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '操作失败，请稍后重试' },
    })
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('数据库加载失败也由云入口返回通用中文错误', async () => {
    const store = new MemoryStore(createDevelopmentSeed()) as MemoryStore & {
      load: () => Promise<void>
    }
    store.load = async () => {
      throw new Error('database credential leaked')
    }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const handler = createGymHandler(
      store,
      { developmentPaymentsEnabled: false, production: true },
      () => ({ emasUserId: 'dev-member-openid' }),
    )

    await expect(
      handler({ action: 'bootstrap', requestId: 'load-failure', payload: {} }),
    ).resolves.toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '操作失败，请稍后重试' },
    })
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
