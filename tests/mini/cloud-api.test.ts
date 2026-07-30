import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildPublicSlot } from '../../miniprogram/models/member'
import { CloudApi } from '../../miniprogram/services/cloud-api'
import type {
  ApiResponse,
  Lesson,
  MembershipPackage,
  UserRole,
} from '../../miniprogram/shared/contracts'

interface CloudCall {
  name: string
  data: {
    action: string
    requestId: string
    payload: Record<string, unknown>
  }
}

const user = {
  id: 'user-1',
  openId: 'openid-1',
  name: '教练账号',
  phone: '13900000000',
  roles: ['member', 'coach'] as UserRole[],
}

const coach = {
  id: 'coach-1',
  userId: 'user-1',
  name: '林教练',
  status: 'active' as const,
}

const membership = (id: string): MembershipPackage => ({
  id,
  memberId: 'user-1',
  coachId: 'coach-1',
  productId: 'product-1',
  productName: '力量私教',
  purchasePriceCents: 100_000,
  totalLessons: 10,
  availableLessons: 10,
  lockedLessons: 0,
  usedLessons: 0,
  purchasedAt: '2026-08-01T10:00:00+08:00',
})

const bookedLesson: Lesson = {
  id: 'lesson-booked',
  memberId: 'another-member',
  coachId: 'coach-1',
  membershipPackageId: 'membership-new',
  startsAt: '2026-08-02T10:00:00+08:00',
  endsAt: '2026-08-02T11:00:00+08:00',
  status: 'booked',
}

const bootstrap = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  authenticated: true,
  actor: { kind: 'member', id: 'user-1' },
  profile: user,
  roles: user.roles,
  activeRole: 'member',
  packages: [],
  coaches: [coach],
  memberships: [membership('membership-old')],
  lessons: [],
  appeals: [],
  orders: [],
  ...overrides,
})

const ok = (data: unknown): { result: ApiResponse<unknown> } => ({
  result: { ok: true, data },
})

const installWechat = (
  callFunction: (input: CloudCall) => Promise<{ result: ApiResponse<unknown> }>,
  requestPayment = vi.fn((input: { success(): void }) => input.success()),
) => {
  const cloudCall = vi.fn(callFunction)
  ;(
    globalThis as unknown as {
      wx: {
        cloud: { callFunction: typeof cloudCall }
        requestPayment: typeof requestPayment
      }
    }
  ).wx = {
    cloud: { callFunction: cloudCall },
    requestPayment,
  }
  return { cloudCall, requestPayment }
}

afterEach(() => {
  vi.restoreAllMocks()
  delete (globalThis as unknown as { wx?: unknown }).wx
})

describe('production CloudApi adapter', () => {
  it('returns a guest session without manufacturing a user', async () => {
    installWechat(async () =>
      ok(
        bootstrap({
          authenticated: false,
          actor: null,
          profile: null,
          roles: [],
          activeRole: null,
          memberships: [],
          lessons: [],
        }),
      ),
    )
    const api = new CloudApi()

    await expect(api.getSession()).resolves.toEqual({ authenticated: false })
    await expect(api.getMemberHome()).resolves.toMatchObject({
      authenticated: false,
      user: undefined,
    })
  })

  it('sends only cloud-authorized registration fields', async () => {
    const { cloudCall } = installWechat(async ({ data }) => {
      if (data.action === 'registerMember') return ok(user)
      return ok(bootstrap())
    })
    const api = new CloudApi()

    await api.registerMember({
      name: '陈澄',
      avatarUrl: 'cloud://test/avatar.jpg',
      phoneCloudId: 'phone-cloud-id',
      requestId: 'register-1',
    })

    expect(cloudCall).toHaveBeenCalledWith({
      name: 'gym-api',
      data: expect.objectContaining({
        action: 'registerMember',
        payload: {
          name: '陈澄',
          avatarUrl: 'cloud://test/avatar.jpg',
          phoneCloudId: 'phone-cloud-id',
        },
      }),
    })
  })

  it('preserves the real WeChat cloud error message when the request never reaches the function', async () => {
    installWechat(async () => {
      throw {
        errCode: -501005,
        errMsg: 'cloud.callFunction:fail function not found',
      }
    })

    await expect(new CloudApi().getSession()).rejects.toThrow(
      'cloud.callFunction:fail function not found',
    )
  })

  it('reads activeRole and sends it on subsequent bootstrap requests', async () => {
    const { cloudCall } = installWechat(async () =>
      ok(
        bootstrap({
          profile: { ...user, roles: ['coach'] },
          roles: ['coach'],
          activeRole: 'coach',
        }),
      ),
    )
    const api = new CloudApi()

    expect(await api.getSession()).toMatchObject({ role: 'coach' })
    await api.getCoachDashboard('2026-08-02')

    const bootstrapCalls = cloudCall.mock.calls
      .map(([input]) => input.data)
      .filter((data) => data.action === 'bootstrap')
    expect(bootstrapCalls.at(-1)?.payload).toMatchObject({ activeRole: 'coach' })
  })

  it('sends the switched role on the confirming bootstrap request', async () => {
    const { cloudCall } = installWechat(async ({ data }) =>
      ok(bootstrap({ activeRole: data.payload.activeRole ?? 'member' })),
    )
    const api = new CloudApi()

    await api.getSession()
    expect(await api.switchRole('coach')).toMatchObject({ role: 'coach' })

    const bootstrapCalls = cloudCall.mock.calls
      .map(([input]) => input.data)
      .filter((data) => data.action === 'bootstrap')
    expect(bootstrapCalls.at(-1)?.payload).toEqual({ activeRole: 'coach' })
  })

  it('merges a booked lesson into the remote schedule and generates its label', async () => {
    installWechat(async ({ data }) => {
      if (data.action === 'getSchedule') {
        return ok([
          {
            id: 'slot-1',
            coachId: 'coach-1',
            startsAt: bookedLesson.startsAt,
            endsAt: bookedLesson.endsAt,
            open: true,
          },
        ])
      }
      return ok(bootstrap({ lessons: [bookedLesson] }))
    })
    const schedule = await new CloudApi().getCoachSchedule('coach-1', '2026-08-02')
    const slot = schedule.slots[0]

    expect(slot).toMatchObject({
      label: '10:00–11:00',
      locked: true,
      lesson: { id: 'lesson-booked' },
    })
    if (!slot) throw new Error('测试时段不存在')
    expect(
      buildPublicSlot({
        ...slot,
        viewerMemberId: 'user-1',
      }),
    ).toMatchObject({ status: 'occupied', label: '已预约' })
  })

  it('never substitutes the current coach profile for missing member details', async () => {
    installWechat(async () => ok(bootstrap({ activeRole: 'coach', lessons: [bookedLesson] })))

    const dashboard = await new CloudApi().getCoachDashboard('2026-08-02')

    expect(dashboard.lessons[0]).toMatchObject({
      memberName: '会员信息未提供',
      memberPhone: '会员信息未提供',
    })
  })

  it('parses the real purchase shape and confirms only the order-linked membership', async () => {
    const payment = {
      timeStamp: '1',
      nonceStr: 'nonce',
      package: 'prepay_id=1',
      signType: 'RSA',
      paySign: 'signed',
    }
    const { cloudCall, requestPayment } = installWechat(async ({ data }) => {
      if (data.action === 'purchase') {
        return ok({ order: { id: 'order-1' }, payment })
      }
      return ok(
        bootstrap({
          memberships: [membership('membership-new'), membership('membership-old')],
          orders: [{ id: 'order-1', status: 'paid', membershipId: 'membership-new' }],
        }),
      )
    })

    const result = await new CloudApi().purchasePackage({
      productId: 'product-1',
      coachId: 'coach-1',
      requestId: 'purchase-request-1',
    })

    expect(result).toEqual({
      status: 'paid',
      membership: expect.objectContaining({ id: 'membership-new' }),
    })
    expect(requestPayment).toHaveBeenCalledWith(expect.objectContaining(payment))
    expect(cloudCall.mock.calls.filter(([input]) => input.data.action === 'purchase')).toHaveLength(
      1,
    )
  })

  it('settles an explicit cloud test purchase without opening WeChat Pay', async () => {
    const { cloudCall, requestPayment } = installWechat(async ({ data }) => {
      if (data.action === 'purchase') {
        return ok({ order: { id: 'order-test' }, testPayment: true })
      }
      if (data.action === 'createDevPayment') {
        return ok({ memberId: 'member-1' })
      }
      return ok(
        bootstrap({
          memberships: [membership('membership-test')],
          orders: [{ id: 'order-test', status: 'paid', membershipId: 'membership-test' }],
        }),
      )
    })

    const result = await new CloudApi(true).purchasePackage({
      productId: 'product-1',
      coachId: 'coach-1',
      requestId: 'purchase-test-request',
    })

    expect(result).toEqual({
      status: 'paid',
      membership: expect.objectContaining({ id: 'membership-test' }),
    })
    expect(requestPayment).not.toHaveBeenCalled()
    expect(cloudCall.mock.calls.some(([input]) => input.data.action === 'createDevPayment')).toBe(
      true,
    )
  })

  it('keeps a pending order and rechecks it without creating or paying again', async () => {
    let paid = false
    const { cloudCall, requestPayment } = installWechat(async ({ data }) => {
      if (data.action === 'purchase') {
        return ok({
          order: { id: 'order-pending' },
          payment: {
            timeStamp: '1',
            nonceStr: 'nonce',
            package: 'prepay_id=1',
            signType: 'RSA',
            paySign: 'signed',
          },
        })
      }
      return ok(
        bootstrap({
          memberships: paid ? [membership('membership-new')] : [],
          orders: [
            {
              id: 'order-pending',
              status: paid ? 'paid' : 'pending',
              ...(paid ? { membershipId: 'membership-new' } : {}),
            },
          ],
        }),
      )
    })
    const api = new CloudApi()
    const first = await api.purchasePackage({
      productId: 'product-1',
      coachId: 'coach-1',
      requestId: 'same-request',
    })
    expect(first).toEqual({
      status: 'pending',
      orderId: 'order-pending',
      requestId: 'same-request',
    })

    paid = true
    const confirmed = await (
      api as unknown as {
        queryPurchase(input: { orderId: string; requestId: string }): Promise<unknown>
      }
    ).queryPurchase({
      orderId: 'order-pending',
      requestId: 'same-request',
    })

    expect(confirmed).toEqual({
      status: 'paid',
      membership: expect.objectContaining({ id: 'membership-new' }),
    })
    expect(cloudCall.mock.calls.filter(([input]) => input.data.action === 'purchase')).toHaveLength(
      1,
    )
    expect(requestPayment).toHaveBeenCalledTimes(1)
  })

  it('uses the remote occupied flag without exposing another member', async () => {
    installWechat(async ({ data }) => {
      if (data.action === 'getSchedule') {
        return ok([
          {
            startsAt: bookedLesson.startsAt,
            endsAt: bookedLesson.endsAt,
            open: true,
            occupied: true,
          },
        ])
      }
      return ok(bootstrap({ lessons: [] }))
    })

    const slot = (await new CloudApi().getCoachSchedule('coach-1', '2026-08-02')).slots[0]

    expect(slot).toMatchObject({ occupied: true, locked: true })
    if (!slot) throw new Error('测试时段不存在')
    expect(
      buildPublicSlot({
        ...slot,
        viewerMemberId: 'user-1',
      }),
    ).toEqual({
      startsAt: '2026-08-02T10:00:00+08:00',
      endsAt: '2026-08-02T11:00:00+08:00',
      status: 'occupied',
      label: '已预约',
    })
    expect(slot).not.toHaveProperty('memberName')
  })
})
