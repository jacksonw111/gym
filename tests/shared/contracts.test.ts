import { describe, expect, it } from 'vitest'
import type { Appeal, Lesson, User } from '../../miniprogram/shared/contracts'
import { hasRole } from '../../miniprogram/shared/contracts'

const lessonBase = {
  id: 'lesson-1',
  memberId: 'member-1',
  coachId: 'coach-1',
  membershipPackageId: 'membership-1',
  startsAt: '2026-08-01T10:00:00+08:00',
  endsAt: '2026-08-01T11:00:00+08:00',
}

const appealBase = {
  id: 'appeal-1',
  lessonId: 'lesson-1',
  memberId: 'member-1',
  reason: '课程未正常完成',
  createdAt: '2026-08-01T12:00:00+08:00',
}

describe('user roles', () => {
  it('expresses a dual-role account without a special dual role', () => {
    const user: User = {
      id: 'dual-role-user',
      openId: 'dual-role-open-id',
      name: '双身份用户',
      roles: ['member', 'coach'],
    }

    expect(hasRole(user, 'member')).toBe(true)
    expect(hasRole(user, 'coach')).toBe(true)
  })

  it('returns false when a single-role account lacks the requested role', () => {
    const user: User = {
      id: 'member-only-user',
      openId: 'member-only-open-id',
      name: '会员用户',
      roles: ['member'],
    }

    expect(hasRole(user, 'coach')).toBe(false)
  })
})

describe('status-specific contracts', () => {
  it('requires lesson fields according to the lesson status', () => {
    const completed: Lesson = {
      ...lessonBase,
      status: 'completed',
      completionSource: 'member',
      consumedAt: '2026-08-01T11:00:00+08:00',
    }
    const consumedCancellation: Lesson = {
      ...lessonBase,
      status: 'coach_cancelled_consumed',
      consumedAt: '2026-08-01T09:30:00+08:00',
    }

    // @ts-expect-error completed lessons require a completion source
    const completedWithoutSource: Lesson = {
      ...lessonBase,
      status: 'completed',
      consumedAt: '2026-08-01T11:00:00+08:00',
    }
    // @ts-expect-error completed lessons require a consumption timestamp
    const completedWithoutConsumption: Lesson = {
      ...lessonBase,
      status: 'completed',
      completionSource: 'coach',
    }
    const bookedWithCompletionSource: Lesson = {
      ...lessonBase,
      status: 'booked',
      // @ts-expect-error booked lessons cannot contain a completion source
      completionSource: 'system',
    }
    // @ts-expect-error booked lessons cannot contain a consumption timestamp
    const bookedWithConsumption: Lesson = {
      ...lessonBase,
      status: 'booked',
      consumedAt: '2026-08-02T11:00:00+08:00',
    }
    // @ts-expect-error consumed coach cancellations require a consumption timestamp
    const consumedCancellationWithoutTimestamp: Lesson = {
      ...lessonBase,
      status: 'coach_cancelled_consumed',
    }
    // @ts-expect-error released coach cancellations cannot contain a consumption timestamp
    const releasedCancellationWithConsumption: Lesson = {
      ...lessonBase,
      status: 'coach_cancelled_released',
      consumedAt: '2026-08-01T09:30:00+08:00',
    }

    expect(completed.status).toBe('completed')
    expect(consumedCancellation.status).toBe('coach_cancelled_consumed')
    expect(completedWithoutSource.status).toBe('completed')
    expect(completedWithoutConsumption.status).toBe('completed')
    expect(bookedWithCompletionSource.status).toBe('booked')
    expect(bookedWithConsumption.status).toBe('booked')
    expect(consumedCancellationWithoutTimestamp.status).toBe('coach_cancelled_consumed')
    expect(releasedCancellationWithConsumption.status).toBe('coach_cancelled_released')
  })

  it('requires appeal fields according to the appeal status', () => {
    const pending: Appeal = {
      ...appealBase,
      status: 'pending',
      lessonRefunded: false,
    }
    const approved: Appeal = {
      ...appealBase,
      status: 'approved',
      handledBy: 'admin-1',
      handledAt: '2026-08-02T10:00:00+08:00',
      decisionNote: '核实后退回课时',
      refundedAt: '2026-08-02T10:00:00+08:00',
      lessonRefunded: true,
    }
    const rejected: Appeal = {
      ...appealBase,
      status: 'rejected',
      handledBy: 'admin-1',
      handledAt: '2026-08-02T10:00:00+08:00',
      decisionNote: '课程记录正常',
      lessonRefunded: false,
    }

    // @ts-expect-error pending appeals cannot contain handling fields
    const handledPending: Appeal = {
      ...appealBase,
      status: 'pending',
      handledBy: 'admin-1',
      lessonRefunded: false,
    }
    // @ts-expect-error approved appeals require complete handling and refund fields
    const approvedWithoutRefund: Appeal = {
      ...appealBase,
      status: 'approved',
      handledBy: 'admin-1',
      handledAt: '2026-08-02T10:00:00+08:00',
      decisionNote: '核实后退回课时',
      lessonRefunded: true,
    }
    // @ts-expect-error rejected appeals cannot contain a refund timestamp
    const rejectedWithRefund: Appeal = {
      ...appealBase,
      status: 'rejected',
      handledBy: 'admin-1',
      handledAt: '2026-08-02T10:00:00+08:00',
      decisionNote: '课程记录正常',
      refundedAt: '2026-08-02T10:00:00+08:00',
      lessonRefunded: false,
    }

    expect(pending.status).toBe('pending')
    expect(approved.status).toBe('approved')
    expect(rejected.status).toBe('rejected')
    expect(handledPending.status).toBe('pending')
    expect(approvedWithoutRefund.status).toBe('approved')
    expect(rejectedWithRefund.status).toBe('rejected')
  })
})
