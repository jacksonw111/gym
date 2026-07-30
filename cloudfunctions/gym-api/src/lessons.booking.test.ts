import { describe, expect, it } from 'vitest'
import { bookLesson } from './lessons'
import {
  type Coach,
  type MembershipPackage,
  MemoryStore,
  type ScheduleSlot,
  type StoreSeed,
} from './store'

const coach: Coach = {
  id: 'coach-1',
  userId: 'coach-user-1',
  name: '教练',
  status: 'active',
}

const membership: MembershipPackage = {
  id: 'package-1',
  memberId: 'member-1',
  coachId: coach.id,
  coachName: coach.name,
  productId: 'product-1',
  productName: '私教课',
  purchasePriceCents: 500,
  totalLessons: 1,
  availableLessons: 1,
  lockedLessons: 0,
  usedLessons: 0,
  purchasedAt: '2026-07-01T00:00:00.000Z',
}

const slot: ScheduleSlot = {
  id: 'slot-1',
  coachId: coach.id,
  startsAt: '2026-08-01T10:00:00.000Z',
  endsAt: '2026-08-01T11:00:00.000Z',
  open: true,
}

describe('预约', () => {
  it('事务内锁定余额，重复 requestId 返回同一课程且不重复锁定', async () => {
    const store = new MemoryStore({ coaches: [coach], packages: [membership], schedules: [slot] })

    const first = await bookLesson(store, {
      memberId: 'member-1',
      coachId: coach.id,
      packageId: membership.id,
      startsAt: slot.startsAt,
      requestId: 'book-request-1',
      now: '2026-07-30T00:00:00.000Z',
    })
    const repeated = await bookLesson(store, {
      memberId: 'member-1',
      coachId: coach.id,
      packageId: membership.id,
      startsAt: slot.startsAt,
      requestId: 'book-request-1',
      now: '2026-07-30T00:00:01.000Z',
    })

    expect(repeated.id).toBe(first.id)
    expect(store.packages[0]).toMatchObject({ availableLessons: 0, lockedLessons: 1 })
    expect(store.ledger).toHaveLength(1)
    expect(store.ledger[0]?.operation).toBe('lock')
  })

  it('并发争抢同一教练同一时段时只允许一人成功', async () => {
    const otherMembership: MembershipPackage = {
      ...membership,
      id: 'package-2',
      memberId: 'member-2',
    }
    const store = new MemoryStore({
      coaches: [coach],
      packages: [membership, otherMembership],
      schedules: [slot],
    })

    const attempts = await Promise.allSettled([
      bookLesson(store, {
        memberId: 'member-1',
        coachId: coach.id,
        packageId: membership.id,
        startsAt: slot.startsAt,
        requestId: 'concurrent-1',
        now: '2026-07-30T00:00:00.000Z',
      }),
      bookLesson(store, {
        memberId: 'member-2',
        coachId: coach.id,
        packageId: otherMembership.id,
        startsAt: slot.startsAt,
        requestId: 'concurrent-2',
        now: '2026-07-30T00:00:00.000Z',
      }),
    ])

    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(store.lessons).toHaveLength(1)
    expect(store.packages.reduce((sum, item) => sum + item.lockedLessons, 0)).toBe(1)
  })

  const rejectionCases: Array<[string, StoreSeed]> = [
    ['inactive 教练', { coaches: [{ ...coach, status: 'inactive' as const }] }],
    ['关闭时段', { schedules: [{ ...slot, open: false }] }],
    ['不匹配教练', { packages: [{ ...membership, coachId: 'coach-2' }] }],
    ['无可用课时', { packages: [{ ...membership, availableLessons: 0, usedLessons: 1 }] }],
  ]

  it.each(rejectionCases)('拒绝%s', async (_label, override) => {
    const store = new MemoryStore({
      coaches: override.coaches ?? [coach],
      packages: override.packages ?? [membership],
      schedules: override.schedules ?? [slot],
    })

    await expect(
      bookLesson(store, {
        memberId: 'member-1',
        coachId: coach.id,
        packageId: membership.id,
        startsAt: slot.startsAt,
        requestId: `reject-${_label}`,
        now: '2026-07-30T00:00:00.000Z',
      }),
    ).rejects.toThrow()
  })
})
