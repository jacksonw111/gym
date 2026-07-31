import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildPublicSlot } from '../../miniprogram/models/member'
import { EmasApi, type EmasClient } from '../../miniprogram/services/emas-api'
import type {
  ApiResponse,
  Lesson,
  MembershipPackage,
  UserRole,
} from '../../miniprogram/shared/contracts'

interface EmasCall {
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

let emasClient: EmasClient

const createApi = (testPaymentEnabled = false): EmasApi =>
  new EmasApi(emasClient, testPaymentEnabled)

const installEmas = (
  invokeHandler: (input: EmasCall) => Promise<{ result: ApiResponse<unknown> }>,
  requestPayment = vi.fn((input: { success(): void }) => input.success()),
) => {
  const invoke = vi.fn((name: string, data: EmasCall['data']) => invokeHandler({ name, data }))
  const uploadFile = vi.fn(async () => ({
    fileUrl: 'https://storage.example/avatar.jpg',
    filePath: '/avatars/avatar.jpg',
  }))
  emasClient = {
    function: { invoke },
    file: { uploadFile },
  }
  ;(
    globalThis as unknown as {
      wx: {
        requestPayment: typeof requestPayment
      }
    }
  ).wx = {
    requestPayment,
  }
  return { invoke, requestPayment, uploadFile }
}

afterEach(() => {
  vi.restoreAllMocks()
  delete (globalThis as unknown as { wx?: unknown }).wx
})

describe('production EmasApi adapter', () => {
  it('uploads member avatars to EMAS storage', async () => {
    const { uploadFile } = installEmas(async () => ok(bootstrap()))

    await expect(createApi().uploadAvatar('/tmp/avatar.png')).resolves.toBe(
      'https://storage.example/avatar.jpg',
    )
    expect(uploadFile).toHaveBeenCalledWith({
      filePath: '/tmp/avatar.png',
      cloudPath: expect.stringMatching(/^\/avatars\/.+\.png$/),
    })
  })

  it('returns a guest session without manufacturing a user', async () => {
    installEmas(async () =>
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
    const api = createApi()

    await expect(api.getSession()).resolves.toEqual({ authenticated: false })
    await expect(api.getMemberHome()).resolves.toMatchObject({
      authenticated: false,
      user: undefined,
    })
  })

  it('sends only cloud-authorized registration fields', async () => {
    const { invoke } = installEmas(async ({ data }) => {
      if (data.action === 'registerMember') return ok(user)
      return ok(bootstrap())
    })
    const api = createApi()

    await api.registerMember({
      name: '陈澄',
      avatarUrl: 'https://storage.example/avatar.jpg',
      phoneCode: 'phone-code',
      requestId: 'register-1',
    })

    expect(invoke).toHaveBeenCalledWith(
      'gym-api',
      expect.objectContaining({
        action: 'registerMember',
        payload: {
          name: '陈澄',
          avatarUrl: 'https://storage.example/avatar.jpg',
          phoneCode: 'phone-code',
        },
      }),
    )
  })

  it('sends a manually entered phone when WeChat authorization is unavailable', async () => {
    const { invoke } = installEmas(async ({ data }) => {
      if (data.action === 'registerMember') return ok(user)
      return ok(bootstrap())
    })

    await createApi().registerMember({
      name: '陈澄',
      avatarUrl: 'https://storage.example/avatar.jpg',
      phone: '13800000000',
      requestId: 'register-manual-1',
    })

    expect(invoke).toHaveBeenCalledWith(
      'gym-api',
      expect.objectContaining({
        action: 'registerMember',
        payload: {
          name: '陈澄',
          avatarUrl: 'https://storage.example/avatar.jpg',
          phone: '13800000000',
        },
      }),
    )
  })

  it('preserves the real WeChat cloud error message when the request never reaches the function', async () => {
    installEmas(async () => {
      throw {
        errCode: -501005,
        errMsg: 'function.invoke:fail function not found',
      }
    })

    await expect(createApi().getSession()).rejects.toThrow(
      'function.invoke:fail function not found',
    )
  })

  it('reads activeRole and sends it on subsequent bootstrap requests', async () => {
    const { invoke } = installEmas(async () =>
      ok(
        bootstrap({
          profile: { ...user, roles: ['coach'] },
          roles: ['coach'],
          activeRole: 'coach',
        }),
      ),
    )
    const api = createApi()

    expect(await api.getSession()).toMatchObject({ role: 'coach' })
    await api.getCoachDashboard('2026-08-02')

    const bootstrapCalls = invoke.mock.calls
      .map(([, data]) => data)
      .filter((data) => data.action === 'bootstrap')
    expect(bootstrapCalls.at(-1)?.payload).toMatchObject({ activeRole: 'coach' })
  })

  it('sends the switched role on the confirming bootstrap request', async () => {
    const { invoke } = installEmas(async ({ data }) =>
      ok(bootstrap({ activeRole: data.payload.activeRole ?? 'member' })),
    )
    const api = createApi()

    await api.getSession()
    expect(await api.switchRole('coach')).toMatchObject({ role: 'coach' })

    const bootstrapCalls = invoke.mock.calls
      .map(([, data]) => data)
      .filter((data) => data.action === 'bootstrap')
    expect(bootstrapCalls.at(-1)?.payload).toEqual({ activeRole: 'coach' })
  })

  it('merges a booked lesson into the remote schedule and generates its label', async () => {
    installEmas(async ({ data }) => {
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
    const schedule = await createApi().getCoachSchedule('coach-1', '2026-08-02')
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
    installEmas(async () => ok(bootstrap({ activeRole: 'coach', lessons: [bookedLesson] })))

    const dashboard = await createApi().getCoachDashboard('2026-08-02')

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
    const { invoke, requestPayment } = installEmas(async ({ data }) => {
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

    const result = await createApi().purchasePackage({
      productId: 'product-1',
      coachId: 'coach-1',
      requestId: 'purchase-request-1',
    })

    expect(result).toEqual({
      status: 'paid',
      membership: expect.objectContaining({ id: 'membership-new' }),
    })
    expect(requestPayment).toHaveBeenCalledWith(expect.objectContaining(payment))
    expect(invoke.mock.calls.filter(([, data]) => data.action === 'purchase')).toHaveLength(1)
  })

  it('settles an explicit cloud test purchase without opening WeChat Pay', async () => {
    const { invoke, requestPayment } = installEmas(async ({ data }) => {
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

    const result = await createApi(true).purchasePackage({
      productId: 'product-1',
      coachId: 'coach-1',
      requestId: 'purchase-test-request',
    })

    expect(result).toEqual({
      status: 'paid',
      membership: expect.objectContaining({ id: 'membership-test' }),
    })
    expect(requestPayment).not.toHaveBeenCalled()
    expect(invoke.mock.calls.some(([, data]) => data.action === 'createDevPayment')).toBe(true)
  })

  it('keeps a pending order and rechecks it without creating or paying again', async () => {
    let paid = false
    const { invoke, requestPayment } = installEmas(async ({ data }) => {
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
    const api = createApi()
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
    expect(invoke.mock.calls.filter(([, data]) => data.action === 'purchase')).toHaveLength(1)
    expect(requestPayment).toHaveBeenCalledTimes(1)
  })

  it('uses the remote occupied flag without exposing another member', async () => {
    installEmas(async ({ data }) => {
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

    const slot = (await createApi().getCoachSchedule('coach-1', '2026-08-02')).slots[0]

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
