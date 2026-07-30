import { describe, expect, it } from 'vitest'
import { adjustBalance, createOrder, grantPaidOrder, type PackageProduct } from './packages'
import { type Coach, MemoryStore, type User } from './store'

const member: User = {
  id: 'member-1',
  openId: 'openid-member',
  name: '会员',
  roles: ['member'],
}

const coach: Coach = {
  id: 'coach-1',
  userId: 'coach-user-1',
  name: '教练',
  status: 'active',
}

const product: PackageProduct = {
  id: 'product-1',
  name: '十节私教课',
  priceCents: 5_000,
  lessonCount: 10,
  status: 'published',
}

describe('课包和订单', () => {
  it('相同requestId只创建一个订单，并保存教练与商品快照', async () => {
    const store = new MemoryStore({ users: [member], coaches: [coach], products: [product] })
    const input = {
      id: 'order-idempotent',
      requestId: 'purchase-request-1',
      memberId: member.id,
      coachId: coach.id,
      productId: product.id,
      createdAt: '2026-07-30T00:00:00.000Z',
    }

    const first = await createOrder(store, input)
    const repeated = await createOrder(store, { ...input, id: 'must-not-be-used' })
    const membership = await grantPaidOrder(store, {
      orderId: first.id,
      paymentId: 'payment-idempotent',
      paidAt: '2026-07-30T00:01:00.000Z',
    })

    expect(repeated.id).toBe(first.id)
    expect(store.orders).toHaveLength(1)
    expect(first).toMatchObject({
      requestId: input.requestId,
      coachId: coach.id,
      coachName: coach.name,
      productSnapshot: { name: product.name },
    })
    expect(membership).toMatchObject({ coachId: coach.id, coachName: coach.name })
  })

  it('重复支付通知只发放一个绑定教练并保存商品快照的课包', async () => {
    const store = new MemoryStore({ users: [member], coaches: [coach], products: [product] })
    const order = await createOrder(store, {
      id: 'order-1',
      requestId: 'purchase-1',
      memberId: member.id,
      coachId: coach.id,
      productId: product.id,
      createdAt: '2026-07-30T00:00:00.000Z',
    })

    const first = await grantPaidOrder(store, {
      orderId: order.id,
      paymentId: 'wechat-payment-1',
      paidAt: '2026-07-30T00:01:00.000Z',
    })
    const repeated = await grantPaidOrder(store, {
      orderId: order.id,
      paymentId: 'wechat-payment-1',
      paidAt: '2026-07-30T00:02:00.000Z',
    })

    expect(repeated.id).toBe(first.id)
    expect(store.packages).toHaveLength(1)
    expect(first).toMatchObject({
      coachId: coach.id,
      productId: product.id,
      productName: product.name,
      purchasePriceCents: product.priceCents,
      totalLessons: product.lessonCount,
      availableLessons: 10,
      lockedLessons: 0,
      usedLessons: 0,
    })
    expect(store.orders[0]?.productSnapshot).toEqual({
      id: product.id,
      name: product.name,
      priceCents: product.priceCents,
      lessonCount: product.lessonCount,
    })
    expect(store.ledger).toHaveLength(1)
    expect(store.ledger[0]?.operation).toBe('purchase')
  })

  it('人工调整写追加流水并保持 available + locked + used 守恒', async () => {
    const store = new MemoryStore({ users: [member], coaches: [coach], products: [product] })
    const order = await createOrder(store, {
      id: 'order-1',
      requestId: 'purchase-1',
      memberId: member.id,
      coachId: coach.id,
      productId: product.id,
      createdAt: '2026-07-30T00:00:00.000Z',
    })
    const membership = await grantPaidOrder(store, {
      orderId: order.id,
      paymentId: 'payment-1',
      paidAt: '2026-07-30T00:01:00.000Z',
    })

    const adjusted = await adjustBalance(store, {
      packageId: membership.id,
      delta: 2,
      adminId: 'admin-1',
      note: '线下补课',
      now: '2026-07-30T00:02:00.000Z',
      requestId: 'adjust-1',
    })

    expect(adjusted.availableLessons).toBe(12)
    expect(adjusted.availableLessons + adjusted.lockedLessons + adjusted.usedLessons).toBe(
      adjusted.totalLessons,
    )
    expect(adjusted.totalLessons).toBe(12)
    expect(store.ledger.at(-1)).toMatchObject({
      operation: 'manual_adjust',
      availableDelta: 2,
      totalDelta: 2,
    })
  })
})
