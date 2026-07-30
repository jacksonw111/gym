import { beforeEach, describe, expect, it } from 'vitest'
import { DevelopmentApi } from '../../miniprogram/services/development-api'
import { DevelopmentStore, type StorageAdapter } from '../../miniprogram/services/development-store'

class MemoryStorage implements StorageAdapter {
  private value: unknown
  setCount = 0

  get(): unknown {
    return this.value
  }

  set(value: unknown): void {
    this.setCount += 1
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
    const purchase = await api.purchasePackage({
      productId: 'product-strength-12',
      coachId: 'coach-lin',
      requestId: 'buy-1',
    })
    const repeatedPurchase = await api.purchasePackage({
      productId: 'product-strength-12',
      coachId: 'coach-lin',
      requestId: 'buy-1',
    })
    if (purchase.status !== 'paid' || repeatedPurchase.status !== 'paid') {
      throw new Error('expected immediate development payment')
    }
    const purchased = purchase.membership
    const repeated = repeatedPurchase.membership

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

  it('rejects booking a slot that has already started', async () => {
    const home = await api.getMemberHome()
    const membership = home.memberships[0]
    if (!membership) throw new Error('expected seeded membership')

    await expect(
      api.bookLesson({
        coachId: membership.coachId,
        membershipPackageId: membership.id,
        startsAt: '2026-08-01T08:00:00+08:00',
        requestId: 'past-booking',
      }),
    ).rejects.toThrow('只能预约尚未开始的时段')
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

  it('persists a completion and its balance change atomically, then saves feedback separately', async () => {
    const now = () => new Date('2026-08-01T14:00:00+08:00')
    const storage = new MemoryStorage()
    const completionApi = new DevelopmentApi(new DevelopmentStore(storage, now), now)
    const lesson = (await completionApi.listMemberLessons()).upcoming[0]
    if (!lesson) throw new Error('expected seeded booked lesson')
    const writesBeforeCompletion = storage.setCount

    const completed = await completionApi.completeLesson({
      lessonId: lesson.id,
      requestId: 'atomic-complete',
    })

    expect(storage.setCount - writesBeforeCompletion).toBe(1)
    expect(completed.status).toBe('completed')

    const withFeedback = await (
      completionApi as unknown as {
        saveFeedback(input: {
          lessonId: string
          rating: 5
          comment: string
          requestId: string
        }): Promise<{ feedback?: { rating?: number; comment?: string } }>
      }
    ).saveFeedback({
      lessonId: lesson.id,
      rating: 5,
      comment: '状态很好',
      requestId: 'feedback-1',
    })
    expect(withFeedback.feedback).toMatchObject({ rating: 5, comment: '状态很好' })
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

  it('rolls back an interrupted local mutation without persisting partial state', () => {
    const storage = new MemoryStorage()
    const store = new DevelopmentStore(storage, () => new Date('2026-08-01T08:00:00+08:00'))
    const writesBefore = storage.setCount

    expect(() =>
      store.update((draft) => {
        draft.role = 'coach'
        throw new Error('interrupted')
      }),
    ).toThrow('interrupted')
    expect(store.read().role).toBe('member')
    expect(storage.setCount).toBe(writesBefore)
  })
})
