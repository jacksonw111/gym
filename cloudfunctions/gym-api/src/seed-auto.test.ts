import { describe, expect, it } from 'vitest'
import { autoCompleteDueLessons } from '../../auto-complete-lessons/src/index'
import { createDevelopmentSeed } from './seed'
import { type Lesson, type MembershipPackage, MemoryStore } from './store'

describe('开发数据', () => {
  it('每次生成完全相同且包含可购买商品、活跃教练、开放排班和管理员', () => {
    const first = createDevelopmentSeed()
    const second = createDevelopmentSeed()
    expect(second).toEqual(first)
    expect(first.products?.some((item) => item.status === 'published')).toBe(true)
    expect(first.coaches?.some((item) => item.status === 'active')).toBe(true)
    expect(first.schedules?.some((item) => item.open)).toBe(true)
    expect(first.admins).toHaveLength(1)
  })
})

describe('定时自动完成', () => {
  it('只完成 endsAt <= now-24h 的 booked 课程并复用幂等完成规则', async () => {
    const membership: MembershipPackage = {
      id: 'package-1',
      memberId: 'member-1',
      coachId: 'coach-1',
      productId: 'product-1',
      productName: '私教课',
      purchasePriceCents: 500,
      totalLessons: 2,
      availableLessons: 0,
      lockedLessons: 2,
      usedLessons: 0,
      purchasedAt: '2026-07-01T00:00:00.000Z',
    }
    const due: Lesson = {
      id: 'lesson-due',
      requestId: 'due',
      memberId: 'member-1',
      coachId: 'coach-1',
      membershipPackageId: membership.id,
      startsAt: '2026-07-28T09:00:00.000Z',
      endsAt: '2026-07-28T10:00:00.000Z',
      status: 'booked',
    }
    const notDue: Lesson = {
      ...due,
      id: 'lesson-not-due',
      requestId: 'not-due',
      startsAt: '2026-07-29T09:00:00.001Z',
      endsAt: '2026-07-29T10:00:00.001Z',
    }
    const store = new MemoryStore({ packages: [membership], lessons: [due, notDue] })

    const first = await autoCompleteDueLessons(store, '2026-07-30T10:00:00.000Z')
    const repeated = await autoCompleteDueLessons(store, '2026-07-30T10:00:00.000Z')

    expect(first).toEqual(['lesson-due'])
    expect(repeated).toEqual([])
    expect(store.lessons.find((item) => item.id === due.id)?.status).toBe('completed')
    expect(store.lessons.find((item) => item.id === notDue.id)?.status).toBe('booked')
    expect(store.packages[0]).toMatchObject({ lockedLessons: 1, usedLessons: 1 })
  })
})
