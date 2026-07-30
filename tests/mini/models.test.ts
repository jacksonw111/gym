import { describe, expect, it } from 'vitest'
import { resolveEnvironment } from '../../miniprogram/config/env'
import {
  applyBulkAvailability,
  buildDefaultSchedule,
  sortCoachLessons,
} from '../../miniprogram/models/coach'
import {
  availablePackagesForCoach,
  buildMemberHomeModel,
  buildPublicSlot,
  getLessonActions,
  switchableRole,
} from '../../miniprogram/models/member'
import type { Lesson, MembershipPackage, User } from '../../miniprogram/shared/contracts'

const packages: MembershipPackage[] = [
  {
    id: 'membership-a',
    memberId: 'member-1',
    coachId: 'coach-a',
    productId: 'product-a',
    productName: '力量私教 12 课时',
    purchasePriceCents: 468_000,
    totalLessons: 12,
    availableLessons: 7,
    lockedLessons: 1,
    usedLessons: 4,
    purchasedAt: '2026-07-01T10:00:00+08:00',
  },
  {
    id: 'membership-b',
    memberId: 'member-1',
    coachId: 'coach-b',
    productId: 'product-b',
    productName: '体能进阶 8 课时',
    purchasePriceCents: 328_000,
    totalLessons: 8,
    availableLessons: 3,
    lockedLessons: 0,
    usedLessons: 5,
    purchasedAt: '2026-07-10T10:00:00+08:00',
  },
]

const bookedLesson = (id: string, startsAt: string, coachId = 'coach-a'): Lesson => ({
  id,
  memberId: 'member-1',
  coachId,
  membershipPackageId: 'membership-a',
  startsAt,
  endsAt: new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString(),
  status: 'booked',
})

describe('mini program environment protection', () => {
  it('allows deterministic local data and test payment in development', () => {
    expect(
      resolveEnvironment({
        mode: 'development',
        cloudEnvId: '',
        testPaymentEnabled: true,
      }),
    ).toEqual({
      mode: 'development',
      cloudEnvId: '',
      useLocalData: true,
      testPaymentEnabled: true,
    })
  })

  it('rejects a production build without CloudBase or with test payment enabled', () => {
    expect(() =>
      resolveEnvironment({
        mode: 'production',
        cloudEnvId: '',
        testPaymentEnabled: false,
      }),
    ).toThrow('生产环境必须配置 CloudBase 环境')
    expect(() =>
      resolveEnvironment({
        mode: 'production',
        cloudEnvId: 'cloud-prod',
        testPaymentEnabled: true,
      }),
    ).toThrow('生产环境禁止测试支付')
  })
})

describe('member page models', () => {
  it('formats package price, totals spendable balance, and finds the next lesson', () => {
    const later = bookedLesson('later', '2026-08-02T15:00:00+08:00')
    const sooner = bookedLesson('sooner', '2026-08-01T11:00:00+08:00')
    const past = bookedLesson('past', '2026-07-01T11:00:00+08:00')
    const model = buildMemberHomeModel(
      packages,
      [later, past, sooner],
      new Date('2026-08-01T08:00:00+08:00'),
    )

    expect(model.totalAvailableLessons).toBe(10)
    expect(model.nextLesson?.id).toBe('sooner')
    expect(model.packages[0]?.price).toBe('¥4,680')
  })

  it('does not expose another member identity in an occupied slot', () => {
    expect(
      buildPublicSlot({
        startsAt: '2026-08-01T10:00:00+08:00',
        endsAt: '2026-08-01T11:00:00+08:00',
        open: true,
        lesson: {
          ...bookedLesson('private', '2026-08-01T10:00:00+08:00'),
          memberId: 'another-member',
        },
        memberName: '不应被看见',
        viewerMemberId: 'member-1',
      }),
    ).toEqual({
      startsAt: '2026-08-01T10:00:00+08:00',
      endsAt: '2026-08-01T11:00:00+08:00',
      status: 'occupied',
      label: '已预约',
    })
  })

  it('only offers packages bound to the current coach with available lessons', () => {
    expect(availablePackagesForCoach(packages, 'coach-a').map((item) => item.id)).toEqual([
      'membership-a',
    ])
    expect(availablePackagesForCoach(packages, 'coach-b').map((item) => item.id)).toEqual([
      'membership-b',
    ])
    const firstPackage = packages[0]
    if (!firstPackage) throw new Error('expected package fixture')
    expect(
      availablePackagesForCoach([{ ...firstPackage, availableLessons: 0 }], 'coach-a'),
    ).toEqual([])
  })

  it('makes cancellation, completion, and appeal available only in their valid windows', () => {
    const future = bookedLesson('future', '2026-08-01T10:00:00+08:00')
    const ended: Lesson = {
      ...future,
      id: 'ended',
      startsAt: '2026-07-30T09:00:00+08:00',
      endsAt: '2026-07-30T10:00:00+08:00',
    }
    const consumed: Lesson = {
      ...ended,
      status: 'completed',
      completionSource: 'coach',
      consumedAt: '2026-07-30T10:00:00+08:00',
    }

    expect(getLessonActions(future, new Date('2026-08-01T08:00:00+08:00')).canCancel).toBe(true)
    expect(getLessonActions(future, new Date('2026-08-01T08:01:00+08:00'))).toMatchObject({
      canCancel: false,
      cancelHint: '不足 2 小时，请联系教练处理',
    })
    expect(getLessonActions(ended, new Date('2026-07-30T10:00:00+08:00')).canComplete).toBe(true)
    expect(getLessonActions(consumed, new Date('2026-08-06T10:00:00+08:00')).canAppeal).toBe(true)
    expect(getLessonActions(consumed, new Date('2026-08-06T10:00:01+08:00')).canAppeal).toBe(false)
  })

  it('only switches roles for a dual-role account', () => {
    const dual: User = {
      id: 'user-1',
      openId: 'openid',
      name: '林晓',
      roles: ['member', 'coach'],
    }
    expect(switchableRole(dual, 'member')).toBe('coach')
    expect(switchableRole({ ...dual, roles: ['member'] }, 'member')).toBeNull()
  })
})

describe('coach page models', () => {
  it('starts every date with eleven open one-hour slots', () => {
    const slots = buildDefaultSchedule('2026-08-01')
    expect(slots).toHaveLength(11)
    expect(slots.every((slot) => slot.open)).toBe(true)
    expect(slots.at(0)?.label).toBe('10:00–11:00')
    expect(slots.at(-1)?.label).toBe('20:00–21:00')
  })

  it('bulk closing skips booked slots and locks their switch', () => {
    const slots = buildDefaultSchedule('2026-08-01').map((slot, index) =>
      index === 2
        ? {
            ...slot,
            lesson: bookedLesson('locked', slot.startsAt),
            memberName: '周然',
          }
        : slot,
    )
    const result = applyBulkAvailability(slots, false)

    expect(result.changed).toBe(10)
    expect(result.skippedBooked).toBe(1)
    expect(result.slots[2]).toMatchObject({ open: true, locked: true, memberName: '周然' })
    expect(result.slots.filter((slot) => !slot.open)).toHaveLength(10)
  })

  it('sorts the coach timeline by start time', () => {
    const lessons = [
      bookedLesson('afternoon', '2026-08-01T16:00:00+08:00'),
      bookedLesson('morning', '2026-08-01T10:00:00+08:00'),
      bookedLesson('noon', '2026-08-01T12:00:00+08:00'),
    ]
    expect(sortCoachLessons(lessons).map((lesson) => lesson.id)).toEqual([
      'morning',
      'noon',
      'afternoon',
    ])
  })
})
