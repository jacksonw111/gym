import { describe, expect, it } from 'vitest'
import { createCloudHandler, createRouter } from './index'
import { createDevelopmentSeed } from './seed'
import { MemoryStore } from './store'

describe('CloudBase action router', () => {
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
    const store = new MemoryStore(seed)
    const router = createRouter(store, {
      developmentPaymentsEnabled: true,
      production: false,
    })

    const response = await router({
      action: 'bootstrap',
      requestId: 'bootstrap-1',
      payload: {},
      identity: { openId: 'dev-member-openid' },
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
        coach: { schedule: [], lessons: [] },
      },
    })
  })

  it('云入口忽略客户端伪造 identity，只采用服务端解析结果', async () => {
    const store = new MemoryStore(createDevelopmentSeed())
    const handler = createCloudHandler(
      store,
      { developmentPaymentsEnabled: true, production: false },
      () => ({ openId: 'dev-member-openid' }),
    )

    const response = await handler({
      action: 'bootstrap',
      requestId: 'bootstrap-server-identity',
      payload: {},
      identity: { openId: 'forged-openid' },
    })

    expect(response).toMatchObject({
      ok: true,
      data: { profile: { id: 'member-1' } },
    })
  })

  it('bootstrap 为教练身份返回自己的排班、课程和相关申诉', async () => {
    const seed = createDevelopmentSeed()
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
      identity: { openId: 'dev-coach-openid' },
    })

    expect(response).toMatchObject({
      ok: true,
      data: {
        actor: { kind: 'coach', id: 'coach-1' },
        activeRole: 'coach',
        lessons: [{ id: 'lesson-coach-1' }],
        appeals: [{ id: 'appeal-coach-1' }],
        coach: {
          schedule: [{ id: 'slot-1' }],
          lessons: [{ id: 'lesson-coach-1' }],
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
    const identity = { openId: 'dev-member-openid' }
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
      },
    })

    const savedCoach = await router({
      action: 'adminCrud',
      requestId: 'coach-save-1',
      payload: {
        resource: 'coaches',
        operation: 'save',
        data: {
          userId: 'coach-user-2',
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
  })
})
