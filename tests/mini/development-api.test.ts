import { beforeEach, describe, expect, it } from 'vitest'
import { DevelopmentApi } from '../../miniprogram/services/development-api'
import { DevelopmentStore, type StorageAdapter } from '../../miniprogram/services/development-store'

class MemoryStorage implements StorageAdapter {
  private value: unknown

  get(): unknown {
    return this.value
  }

  set(value: unknown): void {
    this.value = value
  }

  clear(): void {
    this.value = undefined
  }
}

describe('development mini program API', () => {
  let api: DevelopmentApi

  beforeEach(() => {
    const store = new DevelopmentStore(
      new MemoryStorage(),
      () => new Date('2026-08-01T08:00:00+08:00'),
    )
    api = new DevelopmentApi(store, () => new Date('2026-08-01T08:00:00+08:00'))
  })

  it('test-purchases a package once and binds it to the selected active coach', async () => {
    const purchased = await api.purchasePackage({
      productId: 'product-strength-12',
      coachId: 'coach-lin',
      requestId: 'buy-1',
    })
    const repeated = await api.purchasePackage({
      productId: 'product-strength-12',
      coachId: 'coach-lin',
      requestId: 'buy-1',
    })

    expect(purchased.id).toBe(repeated.id)
    expect(purchased.coachId).toBe('coach-lin')
    expect(purchased.availableLessons).toBe(12)
    expect(
      (await api.getMemberHome()).memberships.filter((item) => item.id === purchased.id),
    ).toHaveLength(1)
  })

  it('books a coach slot by locking one lesson and cancellation releases it', async () => {
    const before = await api.getMemberHome()
    const membership = before.memberships.find((item) => item.coachId === 'coach-lin')
    expect(membership).toBeDefined()
    if (!membership) throw new Error('expected seeded membership')
    const date = '2026-08-02'
    const slot = (await api.getCoachSchedule('coach-lin', date)).slots[0]
    if (!slot) throw new Error('expected seeded schedule slot')

    const lesson = await api.bookLesson({
      coachId: 'coach-lin',
      membershipPackageId: membership.id,
      startsAt: slot.startsAt,
      requestId: 'book-1',
    })
    const locked = (await api.getMemberHome()).memberships.find((item) => item.id === membership.id)
    expect(lesson.status).toBe('booked')
    expect(locked).toMatchObject({
      availableLessons: membership.availableLessons - 1,
      lockedLessons: membership.lockedLessons + 1,
    })

    await api.cancelLesson({ lessonId: lesson.id, requestId: 'cancel-1' })
    const released = (await api.getMemberHome()).memberships.find(
      (item) => item.id === membership.id,
    )
    expect(released).toMatchObject({
      availableLessons: membership.availableLessons,
      lockedLessons: membership.lockedLessons,
    })
  })

  it('completes an ended lesson once and accepts one appeal in seven days', async () => {
    const now = () => new Date('2026-08-01T14:00:00+08:00')
    const completionApi = new DevelopmentApi(new DevelopmentStore(new MemoryStorage(), now), now)
    const before = await completionApi.getMemberHome()
    const membership = before.memberships[0]
    const lesson = (await completionApi.listMemberLessons()).upcoming[0]
    if (!membership || !lesson) throw new Error('expected seeded booked lesson')

    const completed = await completionApi.completeLesson({
      lessonId: lesson.id,
      requestId: 'complete-1',
    })
    const repeatedCompletion = await completionApi.completeLesson({
      lessonId: lesson.id,
      requestId: 'complete-1',
    })
    const after = (await completionApi.getMemberHome()).memberships[0]
    expect(completed.id).toBe(repeatedCompletion.id)
    expect(completed.status).toBe('completed')
    expect(after).toMatchObject({
      lockedLessons: membership.lockedLessons - 1,
      usedLessons: membership.usedLessons + 1,
    })

    const appeal = await completionApi.submitAppeal({
      lessonId: completed.id,
      reason: '课程记录与实际情况不符',
      note: '',
      requestId: 'appeal-1',
    })
    const repeated = await completionApi.submitAppeal({
      lessonId: completed.id,
      reason: '课程记录与实际情况不符',
      note: '',
      requestId: 'appeal-1',
    })

    expect(appeal.id).toBe(repeated.id)
    expect(appeal.status).toBe('pending')
    expect(
      (await completionApi.listMemberLessons()).history.find((item) => item.id === completed.id)
        ?.appeal,
    ).toMatchObject({
      status: 'pending',
    })
  })

  it('bulk closes open time but preserves booked coach slots', async () => {
    const result = await api.setCoachDayAvailability({
      date: '2026-08-01',
      open: false,
      requestId: 'schedule-1',
    })

    expect(result.skippedBooked).toBeGreaterThan(0)
    expect(result.slots.some((slot) => slot.locked && slot.open)).toBe(true)
    expect(result.slots.filter((slot) => !slot.open)).toHaveLength(10)
  })
})
