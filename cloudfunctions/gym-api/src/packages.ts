import {
  appendLedger,
  assertPackageInvariant,
  DomainError,
  type MembershipPackage,
  type Order,
  type Product,
  type Store,
} from './store'

export type PackageProduct = Product

export interface CreateOrderInput {
  id?: string
  requestId: string
  memberId: string
  coachId: string
  productId: string
  createdAt: string
}

export const createOrder = async (store: Store, input: CreateOrderInput): Promise<Order> =>
  store.transaction(() => {
    const duplicate = store.orders.find(
      (item) => item.memberId === input.memberId && item.requestId === input.requestId,
    )
    if (duplicate) return duplicate
    const member = store.users.find((item) => item.id === input.memberId)
    const coach = store.coaches.find((item) => item.id === input.coachId)
    const product = store.products.find((item) => item.id === input.productId)
    if (!member?.roles.includes('member')) throw new DomainError('会员不存在')
    if (coach?.status !== 'active') throw new DomainError('教练不可购买')
    if (product?.status !== 'published') throw new DomainError('课包商品不可购买')

    const order: Order = {
      id: input.id ?? store.nextId('order'),
      requestId: input.requestId,
      memberId: input.memberId,
      coachId: input.coachId,
      coachName: coach.name,
      productId: input.productId,
      productSnapshot: {
        id: product.id,
        name: product.name,
        priceCents: product.priceCents,
        lessonCount: product.lessonCount,
        ...(product.validDays ? { validDays: product.validDays } : {}),
      },
      status: 'pending',
      createdAt: input.createdAt,
    }
    store.orders.push(order)
    return order
  })

const membershipExpiresAt = (
  productSnapshot: Order['productSnapshot'],
  paidAt: string,
): string | undefined => {
  const validDays = productSnapshot.validDays
  if (!validDays) return undefined
  return new Date(Date.parse(paidAt) + validDays * 24 * 60 * 60 * 1000).toISOString()
}

export interface GrantPaidOrderInput {
  orderId: string
  paymentId: string
  paidAt: string
}

export const grantPaidOrder = async (
  store: Store,
  input: GrantPaidOrderInput,
): Promise<MembershipPackage> =>
  store.transaction(() => {
    const order = store.orders.find((item) => item.id === input.orderId)
    if (!order) throw new DomainError('订单不存在')
    if (order.status === 'paid' && order.packageId) {
      const existing = store.packages.find((item) => item.id === order.packageId)
      if (!existing) throw new DomainError('订单课包不存在')
      return existing
    }
    const duplicatePayment = store.orders.find(
      (item) => item.paymentId === input.paymentId && item.id !== order.id,
    )
    if (duplicatePayment) throw new DomainError('支付单已处理')

    const membership: MembershipPackage = {
      id: store.nextId('package'),
      memberId: order.memberId,
      coachId: order.coachId,
      coachName: order.coachName,
      productId: order.productSnapshot.id,
      productName: order.productSnapshot.name,
      purchasePriceCents: order.productSnapshot.priceCents,
      totalLessons: order.productSnapshot.lessonCount,
      availableLessons: order.productSnapshot.lessonCount,
      lockedLessons: 0,
      usedLessons: 0,
      purchasedAt: input.paidAt,
      ...(membershipExpiresAt(order.productSnapshot, input.paidAt)
        ? { expiresAt: membershipExpiresAt(order.productSnapshot, input.paidAt) }
        : {}),
    }
    assertPackageInvariant(membership)
    store.packages.push(membership)
    order.status = 'paid'
    order.paymentId = input.paymentId
    order.paidAt = input.paidAt
    order.packageId = membership.id
    appendLedger(store, {
      packageId: membership.id,
      operation: 'purchase',
      availableDelta: membership.totalLessons,
      lockedDelta: 0,
      usedDelta: 0,
      totalDelta: membership.totalLessons,
      createdAt: input.paidAt,
    })
    return membership
  })

export interface AdjustBalanceInput {
  packageId: string
  delta: number
  adminId: string
  note: string
  now: string
  requestId: string
}

export const adjustBalance = async (
  store: Store,
  input: AdjustBalanceInput,
): Promise<MembershipPackage> =>
  store.transaction(() => {
    if (!Number.isInteger(input.delta) || input.delta === 0) {
      throw new DomainError('调整课时必须为整数')
    }
    if (!input.note.trim()) throw new DomainError('调整说明不能为空')
    const duplicate = store.ledger.find(
      (item) => item.operation === 'manual_adjust' && item.note?.endsWith(`(${input.requestId})`),
    )
    const membership = store.packages.find((item) => item.id === input.packageId)
    if (!membership) throw new DomainError('课包不存在')
    if (duplicate) return membership
    if (membership.availableLessons + input.delta < 0) throw new DomainError('可用课时不足')

    membership.availableLessons += input.delta
    membership.totalLessons += input.delta
    assertPackageInvariant(membership)
    appendLedger(store, {
      packageId: membership.id,
      operation: 'manual_adjust',
      availableDelta: input.delta,
      lockedDelta: 0,
      usedDelta: 0,
      totalDelta: input.delta,
      createdAt: input.now,
      actorId: input.adminId,
      note: `${input.note} (${input.requestId})`,
    })
    return membership
  })
