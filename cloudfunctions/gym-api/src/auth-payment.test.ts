import { describe, expect, it } from 'vitest'
import { assertCanAccessLesson } from './auth'
import { createOrder } from './packages'
import { createDevPayment, createWechatPaymentProvider, processWechatPayment } from './payment'
import { type Coach, type Lesson, MemoryStore, type Product, type User } from './store'

const lesson: Lesson = {
  id: 'lesson-1',
  requestId: 'request-1',
  memberId: 'member-1',
  coachId: 'coach-1',
  membershipPackageId: 'package-1',
  startsAt: '2026-08-01T10:00:00.000Z',
  endsAt: '2026-08-01T11:00:00.000Z',
  status: 'booked',
}

describe('权限', () => {
  it('会员只能访问自己的课程，教练只能访问自己的课程，管理员可全局访问', () => {
    expect(() => assertCanAccessLesson({ kind: 'member', id: 'member-1' }, lesson)).not.toThrow()
    expect(() => assertCanAccessLesson({ kind: 'member', id: 'member-2' }, lesson)).toThrow('权限')
    expect(() => assertCanAccessLesson({ kind: 'coach', id: 'coach-1' }, lesson)).not.toThrow()
    expect(() => assertCanAccessLesson({ kind: 'coach', id: 'coach-2' }, lesson)).toThrow('权限')
    expect(() => assertCanAccessLesson({ kind: 'admin', id: 'admin-1' }, lesson)).not.toThrow()
  })
})

describe('支付边界', () => {
  const member: User = {
    id: 'member-1',
    openId: 'openid-member',
    name: '会员',
    roles: ['member'],
  }
  const coach: Coach = {
    id: 'coach-1',
    userId: 'coach-user',
    name: '教练',
    status: 'active',
  }
  const product: Product = {
    id: 'product-1',
    name: '私教课',
    priceCents: 500,
    lessonCount: 1,
    status: 'published',
  }

  it('测试支付只在服务端开发开关开启且非生产环境时可用', async () => {
    await expect(
      createDevPayment(
        new MemoryStore(),
        { developmentPaymentsEnabled: true, production: true },
        { orderId: 'order-1', now: '2026-07-30T00:00:00.000Z' },
      ),
    ).rejects.toThrow('生产环境')
    await expect(
      createDevPayment(
        new MemoryStore(),
        { developmentPaymentsEnabled: false, production: false },
        { orderId: 'order-1', now: '2026-07-30T00:00:00.000Z' },
      ),
    ).rejects.toThrow('未开启')
  })

  it('生产订单只有验证过的微信支付服务端通知才能发放', async () => {
    const store = new MemoryStore({ users: [member], coaches: [coach], products: [product] })
    const order = await createOrder(store, {
      id: 'order-1',
      memberId: member.id,
      coachId: coach.id,
      productId: product.id,
      createdAt: '2026-07-30T00:00:00.000Z',
    })

    await expect(
      processWechatPayment(store, {
        orderId: order.id,
        paymentId: 'payment-1',
        paidAt: '2026-07-30T00:01:00.000Z',
        verifiedServerNotification: false,
      }),
    ).rejects.toThrow('验证')
    expect(store.packages).toHaveLength(0)

    await processWechatPayment(store, {
      orderId: order.id,
      paymentId: 'payment-1',
      paidAt: '2026-07-30T00:01:00.000Z',
      verifiedServerNotification: true,
    })
    expect(store.packages).toHaveLength(1)
  })

  it('正式支付参数只从带服务端凭据的支付服务获取', async () => {
    const requests: Array<{
      url: string
      init: { headers: Record<string, string>; body: string }
    }> = []
    const provider = createWechatPaymentProvider(
      { endpoint: 'https://payments.internal/create', apiToken: 'server-secret' },
      async (url, init) => {
        requests.push({ url, init })
        return {
          ok: true,
          json: async () => ({
            orderId: 'order-1',
            payment: {
              timeStamp: '1722326400',
              nonceStr: 'nonce',
              package: 'prepay_id=wx-prepay',
              signType: 'RSA',
              paySign: 'signature',
            },
          }),
        }
      },
    )
    const order = {
      id: 'order-1',
      memberId: member.id,
      coachId: coach.id,
      productId: product.id,
      productSnapshot: {
        id: product.id,
        name: product.name,
        priceCents: product.priceCents,
        lessonCount: product.lessonCount,
      },
      status: 'pending' as const,
      createdAt: '2026-07-30T00:00:00.000Z',
    }

    await expect(provider(order)).resolves.toMatchObject({
      orderId: order.id,
      payment: { package: 'prepay_id=wx-prepay' },
    })
    expect(requests[0]).toMatchObject({
      url: 'https://payments.internal/create',
      init: { headers: { Authorization: 'Bearer server-secret' } },
    })
  })
})
