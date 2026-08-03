import { describe, expect, it } from 'vitest'
import { leaveCoach } from './coaches'
import { type Coach, type Lesson, type MembershipPackage, MemoryStore, type Product } from './store'

const coachA: Coach = { id: 'coach-a', name: '林教练', status: 'active' }
const coachB: Coach = { id: 'coach-b', name: '王教练', status: 'active' }
const inactiveCoach: Coach = { id: 'coach-c', name: '离职教练', status: 'inactive' }

const product = (id: string, coachId: string, status: 'published' | 'unpublished'): Product => ({
  id,
  name: `${id} 课包`,
  priceCents: 5_000,
  lessonCount: 10,
  coachId,
  status,
})

const membership = (
  id: string,
  coachId: string,
  extra: Partial<MembershipPackage> = {},
): MembershipPackage => ({
  id,
  memberId: `member-${id}`,
  coachId,
  coachName: coachA.name,
  productId: `product-${id}`,
  productName: `${id} 课包`,
  purchasePriceCents: 5_000,
  totalLessons: 10,
  availableLessons: 5,
  lockedLessons: 1,
  usedLessons: 4,
  purchasedAt: '2026-07-01T00:00:00.000Z',
  ...extra,
})

const bookedLesson = (id: string, coachId: string, packageId: string): Lesson => ({
  id,
  requestId: `request-${id}`,
  memberId: `member-${id}`,
  coachId,
  membershipPackageId: packageId,
  startsAt: '2026-08-10T02:00:00.000Z',
  endsAt: '2026-08-10T03:00:00.000Z',
  status: 'booked',
})

const now = '2026-08-01T00:00:00.000Z'

describe('教练离职', () => {
  it('没有待转移课包时直接离职并下架课包商品', async () => {
    const store = new MemoryStore({
      coaches: [coachA, coachB],
      products: [
        product('product-1', 'coach-a', 'published'),
        product('product-2', 'coach-a', 'unpublished'),
      ],
    })

    const result = await leaveCoach(store, { coachId: 'coach-a', now })

    expect(result).toEqual({
      transferredMemberships: 0,
      transferredLessons: 0,
      unpublishedProducts: 1,
    })
    expect(store.coaches.find((item) => item.id === 'coach-a')?.status).toBe('inactive')
    expect(store.products.find((item) => item.id === 'product-1')?.status).toBe('unpublished')
  })

  it('有有效会员课包但未提供接收教练时拒绝离职', async () => {
    const store = new MemoryStore({
      coaches: [coachA, coachB],
      products: [product('product-1', 'coach-a', 'published')],
      packages: [membership('membership-1', 'coach-a')],
    })

    await expect(leaveCoach(store, { coachId: 'coach-a', now })).rejects.toThrow(
      '仍有 1 份有效会员课包',
    )
  })

  it('把有效会员课包与其待上课预约转移给接收教练并下架商品', async () => {
    const store = new MemoryStore({
      coaches: [coachA, coachB],
      products: [product('product-1', 'coach-a', 'published')],
      packages: [
        membership('membership-1', 'coach-a'),
        membership('membership-expired', 'coach-a', {
          expiresAt: '2026-07-01T00:00:00.000Z',
        }),
        membership('membership-empty', 'coach-a', {
          availableLessons: 0,
          lockedLessons: 0,
          usedLessons: 10,
        }),
      ],
      lessons: [
        bookedLesson('lesson-1', 'coach-a', 'membership-1'),
        bookedLesson('lesson-expired', 'coach-a', 'membership-expired'),
      ],
    })

    const result = await leaveCoach(store, { coachId: 'coach-a', transferCoachId: 'coach-b', now })

    expect(result).toEqual({
      transferredMemberships: 1,
      transferredLessons: 1,
      unpublishedProducts: 1,
      transferCoachName: '王教练',
    })
    expect(store.packages.find((item) => item.id === 'membership-1')).toMatchObject({
      coachId: 'coach-b',
      coachName: '王教练',
    })
    expect(store.packages.find((item) => item.id === 'membership-expired')).toMatchObject({
      coachId: 'coach-a',
    })
    expect(store.packages.find((item) => item.id === 'membership-empty')).toMatchObject({
      coachId: 'coach-a',
    })
    expect(store.lessons.find((item) => item.id === 'lesson-1')?.coachId).toBe('coach-b')
    expect(store.lessons.find((item) => item.id === 'lesson-expired')?.coachId).toBe('coach-a')
    expect(store.products.find((item) => item.id === 'product-1')?.status).toBe('unpublished')
    expect(store.coaches.find((item) => item.id === 'coach-a')?.status).toBe('inactive')
  })

  it('拒绝把课包转移给离职或停用的教练', async () => {
    const store = new MemoryStore({
      coaches: [coachA, inactiveCoach],
      products: [product('product-1', 'coach-a', 'published')],
      packages: [membership('membership-1', 'coach-a')],
    })

    await expect(
      leaveCoach(store, { coachId: 'coach-a', transferCoachId: 'coach-c', now }),
    ).rejects.toThrow('接收教练不存在或已离职')
  })

  it('已离职教练不能重复离职', async () => {
    const store = new MemoryStore({
      coaches: [inactiveCoach],
      products: [product('product-1', 'coach-c', 'published')],
    })

    await expect(leaveCoach(store, { coachId: 'coach-c', now })).rejects.toThrow('该教练已离职')
  })
})
