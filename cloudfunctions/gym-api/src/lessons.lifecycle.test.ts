import { describe, expect, it } from 'vitest'
import { cancelLessonByCoach, cancelLessonByMember, completeLesson, saveFeedback } from './lessons'
import { type Lesson, type MembershipPackage, MemoryStore } from './store'

const basePackage: MembershipPackage = {
  id: 'package-1',
  memberId: 'member-1',
  coachId: 'coach-1',
  productId: 'product-1',
  productName: '私教课',
  purchasePriceCents: 500,
  totalLessons: 2,
  availableLessons: 1,
  lockedLessons: 1,
  usedLessons: 0,
  purchasedAt: '2026-07-01T00:00:00.000Z',
}

const baseLesson: Lesson = {
  id: 'lesson-1',
  requestId: 'book-1',
  memberId: 'member-1',
  coachId: 'coach-1',
  membershipPackageId: basePackage.id,
  startsAt: '2026-08-01T10:00:00.000Z',
  endsAt: '2026-08-01T11:00:00.000Z',
  status: 'booked',
}

const createStore = (): MemoryStore =>
  new MemoryStore({ packages: [basePackage], lessons: [baseLesson] })

describe('取消课程', () => {
  it('会员恰好提前两小时可以取消并释放锁定课时', async () => {
    const store = createStore()
    const lesson = await cancelLessonByMember(
      store,
      'member-1',
      baseLesson.id,
      '2026-08-01T08:00:00.000Z',
    )

    expect(lesson.status).toBe('member_cancelled')
    expect(store.packages[0]).toMatchObject({ availableLessons: 2, lockedLessons: 0 })
    expect(store.ledger.at(-1)?.operation).toBe('release')
  })

  it('会员不足提前两小时不能取消', async () => {
    const store = createStore()

    await expect(
      cancelLessonByMember(store, 'member-1', baseLesson.id, '2026-08-01T08:00:00.001Z'),
    ).rejects.toThrow('不足两小时')
  })

  it.each([
    [
      false,
      'coach_cancelled_released',
      { availableLessons: 2, lockedLessons: 0, usedLessons: 0 },
      'release',
    ],
    [
      true,
      'coach_cancelled_consumed',
      { availableLessons: 1, lockedLessons: 0, usedLessons: 1 },
      'consume',
    ],
  ] as const)(
    '教练取消时 consume=%s 按选择处理课时',
    async (consume, status, balance, operation) => {
      const store = createStore()
      const lesson = await cancelLessonByCoach(
        store,
        'coach-1',
        baseLesson.id,
        consume,
        '2026-08-01T09:00:00.000Z',
      )

      expect(lesson.status).toBe(status)
      expect(store.packages[0]).toMatchObject(balance)
      expect(store.ledger.at(-1)?.operation).toBe(operation)
    },
  )

  it('终态课程不能再次转换', async () => {
    const store = createStore()
    await cancelLessonByMember(store, 'member-1', baseLesson.id, '2026-08-01T08:00:00.000Z')

    await expect(
      cancelLessonByCoach(store, 'coach-1', baseLesson.id, true, '2026-08-01T08:01:00.000Z'),
    ).rejects.toThrow('终态')
  })
})

describe('完成和反馈', () => {
  it.each([
    ['member', 'member-1'],
    ['coach', 'coach-1'],
  ] as const)('结束后%s可以完成，锁定课时转为已用', async (kind, id) => {
    const store = createStore()
    const lesson = await completeLesson(store, {
      actor: { kind, id },
      lessonId: baseLesson.id,
      now: '2026-08-01T11:00:00.000Z',
    })

    expect(lesson).toMatchObject({ status: 'completed', completionSource: kind })
    expect(store.packages[0]).toMatchObject({
      availableLessons: 1,
      lockedLessons: 0,
      usedLessons: 1,
    })
    expect(store.ledger.at(-1)?.operation).toBe('consume')
  })

  it('系统仅在结束满24小时后自动完成', async () => {
    const tooEarly = createStore()
    await expect(
      completeLesson(tooEarly, {
        actor: { kind: 'system', id: 'scheduler' },
        lessonId: baseLesson.id,
        now: '2026-08-02T10:59:59.999Z',
      }),
    ).rejects.toThrow('24小时')

    const store = createStore()
    const lesson = await completeLesson(store, {
      actor: { kind: 'system', id: 'scheduler' },
      lessonId: baseLesson.id,
      now: '2026-08-02T11:00:00.000Z',
    })
    expect(lesson.completionSource).toBe('system')
  })

  it('重复完成不重复扣课', async () => {
    const store = createStore()
    const input = {
      actor: { kind: 'member' as const, id: 'member-1' },
      lessonId: baseLesson.id,
      now: '2026-08-01T11:00:00.000Z',
    }

    const first = await completeLesson(store, input)
    const repeated = await completeLesson(store, input)

    expect(repeated.id).toBe(first.id)
    expect(store.packages[0]?.usedLessons).toBe(1)
    expect(store.ledger.filter((item) => item.operation === 'consume')).toHaveLength(1)
  })

  it('重复完成仍验证课程归属，不能借幂等读取他人课程', async () => {
    const store = createStore()
    await completeLesson(store, {
      actor: { kind: 'member', id: 'member-1' },
      lessonId: baseLesson.id,
      now: '2026-08-01T11:00:00.000Z',
    })

    await expect(
      completeLesson(store, {
        actor: { kind: 'member', id: 'member-2' },
        lessonId: baseLesson.id,
        now: '2026-08-01T11:01:00.000Z',
      }),
    ).rejects.toThrow('权限')
  })

  it('反馈只能写入已完成课程、内容可全空且每课最多一次', async () => {
    const bookedStore = createStore()
    await expect(
      saveFeedback(bookedStore, 'member-1', baseLesson.id, {}, '2026-08-01T11:01:00.000Z'),
    ).rejects.toThrow('已完成')

    const store = createStore()
    await completeLesson(store, {
      actor: { kind: 'member', id: 'member-1' },
      lessonId: baseLesson.id,
      now: '2026-08-01T11:00:00.000Z',
    })
    const lesson = await saveFeedback(
      store,
      'member-1',
      baseLesson.id,
      {},
      '2026-08-01T11:01:00.000Z',
    )
    expect(lesson.feedback).toEqual({ submittedAt: '2026-08-01T11:01:00.000Z' })
    await expect(
      saveFeedback(store, 'member-1', baseLesson.id, { rating: 5 }, '2026-08-01T11:02:00.000Z'),
    ).rejects.toThrow('提交')
  })
})
