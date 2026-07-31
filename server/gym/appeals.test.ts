import { describe, expect, it } from 'vitest'
import { createAppeal, decideAppeal } from './appeals'
import { type Lesson, type MembershipPackage, MemoryStore } from './store'

const membership: MembershipPackage = {
  id: 'package-1',
  memberId: 'member-1',
  coachId: 'coach-1',
  coachName: '教练',
  productId: 'product-1',
  productName: '私教课',
  purchasePriceCents: 500,
  totalLessons: 1,
  availableLessons: 0,
  lockedLessons: 0,
  usedLessons: 1,
  purchasedAt: '2026-07-01T00:00:00.000Z',
}

const lesson: Lesson = {
  id: 'lesson-1',
  requestId: 'book-1',
  memberId: 'member-1',
  coachId: 'coach-1',
  membershipPackageId: membership.id,
  startsAt: '2026-07-20T10:00:00.000Z',
  endsAt: '2026-07-20T11:00:00.000Z',
  status: 'completed',
  completionSource: 'member',
  consumedAt: '2026-07-20T11:00:00.000Z',
}

const createStore = (): MemoryStore =>
  new MemoryStore({ packages: [membership], lessons: [lesson] })

describe('申诉', () => {
  it('已消耗课程在七天边界内可提交一次，原因不能为空', async () => {
    const empty = createStore()
    await expect(
      createAppeal(empty, {
        memberId: 'member-1',
        lessonId: lesson.id,
        reason: '  ',
        now: '2026-07-27T11:00:00.000Z',
      }),
    ).rejects.toThrow('原因')

    const store = createStore()
    const appeal = await createAppeal(store, {
      memberId: 'member-1',
      lessonId: lesson.id,
      reason: '课程未正常进行',
      now: '2026-07-27T11:00:00.000Z',
    })
    expect(appeal.status).toBe('pending')

    await expect(
      createAppeal(store, {
        memberId: 'member-1',
        lessonId: lesson.id,
        reason: '再次提交',
        now: '2026-07-27T11:00:00.000Z',
      }),
    ).rejects.toThrow('提交')
  })

  it('超过七天不能申诉', async () => {
    const store = createStore()
    await expect(
      createAppeal(store, {
        memberId: 'member-1',
        lessonId: lesson.id,
        reason: '超时',
        now: '2026-07-27T11:00:00.001Z',
      }),
    ).rejects.toThrow('七天')
  })

  it('批准只退款一次并写流水，拒绝不改课时，管理员必须写处理说明', async () => {
    const noNoteStore = createStore()
    const noNoteAppeal = await createAppeal(noNoteStore, {
      memberId: 'member-1',
      lessonId: lesson.id,
      reason: '异常',
      now: '2026-07-21T11:00:00.000Z',
    })
    await expect(
      decideAppeal(noNoteStore, {
        appealId: noNoteAppeal.id,
        decision: 'approve',
        decisionNote: ' ',
        adminId: 'admin-1',
        now: '2026-07-21T12:00:00.000Z',
      }),
    ).rejects.toThrow('说明')

    const approvedStore = createStore()
    const approvedAppeal = await createAppeal(approvedStore, {
      memberId: 'member-1',
      lessonId: lesson.id,
      reason: '异常',
      now: '2026-07-21T11:00:00.000Z',
    })
    const decision = {
      appealId: approvedAppeal.id,
      decision: 'approve' as const,
      decisionNote: '核实后退款',
      adminId: 'admin-1',
      now: '2026-07-21T12:00:00.000Z',
    }
    await decideAppeal(approvedStore, decision)
    await decideAppeal(approvedStore, decision)
    expect(approvedStore.packages[0]).toMatchObject({ availableLessons: 1, usedLessons: 0 })
    expect(approvedStore.ledger.filter((item) => item.operation === 'appeal_refund')).toHaveLength(
      1,
    )

    const rejectedStore = createStore()
    const rejectedAppeal = await createAppeal(rejectedStore, {
      memberId: 'member-1',
      lessonId: lesson.id,
      reason: '异常',
      now: '2026-07-21T11:00:00.000Z',
    })
    await decideAppeal(rejectedStore, {
      ...decision,
      appealId: rejectedAppeal.id,
      decision: 'reject',
    })
    expect(rejectedStore.packages[0]).toEqual(membership)
  })
})
