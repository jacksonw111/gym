// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()

import { createProductionApi } from './production'

const dashboard = {
  coaches: [{ id: 'coach-1', userId: 'coach-user-1', name: '林骁', status: 'active' }],
  members: [
    {
      id: 'member-1',
      openId: 'member-openid',
      name: '陈澄',
      roles: ['member'],
    },
  ],
  packages: [
    {
      id: 'product-1',
      name: '十节私教课',
      priceCents: 5000,
      lessonCount: 10,
      status: 'published',
    },
  ],
  memberships: [
    {
      id: 'membership-1',
      memberId: 'member-1',
      coachId: 'coach-1',
      productId: 'product-1',
      productName: '十节私教课',
      purchasePriceCents: 5000,
      totalLessons: 10,
      availableLessons: 6,
      lockedLessons: 1,
      usedLessons: 3,
      purchasedAt: '2026-07-01T08:00:00.000Z',
    },
  ],
  bookings: [],
  appeals: [],
  orders: [
    {
      id: 'order-1',
      memberId: 'member-1',
      coachId: 'coach-1',
      productId: 'product-1',
      productSnapshot: {
        id: 'product-1',
        name: '十节私教课',
        priceCents: 5000,
        lessonCount: 10,
      },
      status: 'paid',
      createdAt: '2026-07-01T07:55:00.000Z',
      paidAt: '2026-07-01T08:00:00.000Z',
      packageId: 'membership-1',
    },
  ],
  schedules: [
    {
      id: 'slot-1',
      coachId: 'coach-1',
      startsAt: '2026-08-01T10:00:00.000Z',
      endsAt: '2026-08-01T11:00:00.000Z',
      open: true,
    },
  ],
  ledger: [
    {
      id: 'ledger-1',
      packageId: 'membership-1',
      lessonId: 'lesson-1',
      operation: 'manual_adjust',
      availableDelta: 2,
      lockedDelta: 0,
      usedDelta: 0,
      totalDelta: 2,
      createdAt: '2026-07-30T06:00:00.000Z',
      actorId: 'admin-1',
      note: '线下补课',
    },
  ],
}

const booking = {
  id: 'lesson-1',
  requestId: 'request-1',
  memberId: 'member-1',
  coachId: 'coach-1',
  membershipPackageId: 'membership-1',
  startsAt: '2026-07-26T07:00:00.000Z',
  endsAt: '2026-07-26T08:00:00.000Z',
  status: 'completed',
  completionSource: 'member',
  consumedAt: '2026-07-26T08:02:00.000Z',
  feedback: {
    rating: 5,
    comment: '动作纠正很细致。',
    submittedAt: '2026-07-26T08:10:00.000Z',
  },
}

const appeal = {
  id: 'appeal-1',
  lessonId: 'lesson-1',
  memberId: 'member-1',
  reason: '课程状态有误',
  note: '请复核',
  createdAt: '2026-07-27T01:00:00.000Z',
  status: 'pending',
  lessonRefunded: false,
}

beforeEach(() => {
  fetchMock.mockReset()
  sessionStorage.clear()
  sessionStorage.setItem('purui-admin-session', 'admin-token')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockImplementation(async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as {
      action: string
      payload: { page?: string; resource?: string; operation?: string }
    }
    const result =
      request.action === 'adminPage'
        ? { ...dashboard, bookings: [booking], appeals: [appeal] }
        : request.action === 'listBookings'
          ? [booking]
          : request.action === 'listAppeals'
            ? [appeal]
            : {}
    return { ok: true, json: async () => ({ ok: true, data: result }) }
  })
})

describe('正式数据适配', () => {
  it('通过普通 HTTPS 接口请求后台，不获取 CloudBase 用户身份', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: { token: 'http-admin-token' },
      }),
    })

    await createProductionApi('test-env').login('admin', 'password')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://test-env.service.tcloudbase.com/gym-admin-api',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"action":"adminLogin"'),
      }),
    )
  })

  it('每个后台页面只发送一个 HTTPS 请求', async () => {
    const api = createProductionApi('test-env')

    await api.loadData('products')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://test-env.service.tcloudbase.com/gym-admin-api',
      expect.objectContaining({ body: expect.stringContaining('"action":"adminPage"') }),
    )
    const request = JSON.parse(String(fetchMock.mock.lastCall?.[1]?.body))
    expect(request.payload).toEqual({ page: 'products' })
  })

  it('把云端关联集合和分单位字段转换为后台视图模型', async () => {
    const data = await createProductionApi('test-env').loadData('dashboard')

    expect(data.products[0]).toMatchObject({ price: 50, lessons: 10 })
    expect(data.members[0]?.packages[0]).toMatchObject({
      available: 6,
      locked: 1,
      used: 3,
      total: 10,
      coachName: '林骁',
    })
    expect(data.members[0]?.packages[0]).toMatchObject({
      changes: [expect.objectContaining({ note: '线下补课', availableDelta: 2 })],
    })
    expect(data.coaches[0]).toMatchObject({
      userId: 'coach-user-1',
      schedule: [expect.objectContaining({ date: '2026-08-01', time: '18:00–19:00' })],
    })
    expect(data.bookings[0]).toMatchObject({
      date: '2026-07-26',
      time: '15:00–16:00',
      memberName: '陈澄',
      coachName: '林骁',
      packageName: '十节私教课',
      source: '会员确认完成',
      feedback: expect.objectContaining({ rating: 5, comment: '动作纠正很细致。' }),
    })
    expect(data.appeals[0]).toMatchObject({
      memberName: '陈澄',
      coachName: '林骁',
      packageId: 'membership-1',
      courseAt: '2026-07-26 15:00–16:00',
    })
    expect(data.sales[0]).toMatchObject({
      memberName: '陈澄',
      productName: '十节私教课',
      amount: 50,
    })
  })

  it('保存课包时发送云端 canonical 字段', async () => {
    const api = createProductionApi('test-env')

    await api.saveProduct({
      id: 'product-1',
      name: '进阶课',
      price: 68,
      lessons: 12,
      coachId: 'coach-1',
      validDays: 90,
    })

    const request = JSON.parse(String(fetchMock.mock.lastCall?.[1]?.body))
    expect(request).toEqual(
      expect.objectContaining({
        action: 'adminCrud',
        authToken: 'admin-token',
        payload: {
          resource: 'packages',
          operation: 'save',
          data: {
            id: 'product-1',
            name: '进阶课',
            priceCents: 6800,
            lessonCount: 12,
            coachId: 'coach-1',
            validDays: 90,
          },
        },
      }),
    )
  })

  it('离职教练时发送 coachLeave 并携带接收教练', async () => {
    const api = createProductionApi('test-env')

    await api.leaveCoach('coach-1', 'coach-2')

    const request = JSON.parse(String(fetchMock.mock.lastCall?.[1]?.body))
    expect(request).toEqual(
      expect.objectContaining({
        action: 'coachLeave',
        payload: { coachId: 'coach-1', transferCoachId: 'coach-2' },
      }),
    )
  })
})
