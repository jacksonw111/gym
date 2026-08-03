import type { Lesson, MembershipPackage, User, UserRole } from '../shared/contracts'
import { canMemberCancel, canSubmitAppeal } from '../shared/time'

export interface MemberPackageModel extends MembershipPackage {
  price: string
}

export interface MemberHomeModel {
  packages: MemberPackageModel[]
  totalAvailableLessons: number
  nextLesson?: Lesson
}

export const formatPrice = (priceCents: number): string =>
  `¥${(priceCents / 100).toLocaleString('zh-CN', {
    maximumFractionDigits: priceCents % 100 === 0 ? 0 : 2,
  })}`

export const buildMemberHomeModel = (
  memberships: MembershipPackage[],
  lessons: Lesson[],
  now: Date,
): MemberHomeModel => {
  const nextLesson = lessons
    .filter(
      (lesson) =>
        lesson.status === 'booked' && new Date(lesson.startsAt).getTime() >= now.getTime(),
    )
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt))[0]

  return {
    packages: memberships.map((membership) => ({
      ...membership,
      price: formatPrice(membership.purchasePriceCents),
    })),
    totalAvailableLessons: memberships.reduce(
      (total, membership) => total + membership.availableLessons,
      0,
    ),
    ...(nextLesson ? { nextLesson } : {}),
  }
}

export const isMembershipExpired = (
  membership: Pick<MembershipPackage, 'expiresAt'>,
  now: Date,
): boolean => Boolean(membership.expiresAt && Date.parse(membership.expiresAt) < now.getTime())

export const availablePackagesForCoach = (
  memberships: MembershipPackage[],
  coachId: string,
  now: Date = new Date(),
): MembershipPackage[] =>
  memberships.filter(
    (membership) =>
      membership.coachId === coachId &&
      membership.availableLessons > 0 &&
      !isMembershipExpired(membership, now),
  )

export const productValidityLabel = (product: { validDays?: number }): string =>
  product.validDays ? `购买后 ${product.validDays} 天内有效` : '长期有效'

export const membershipValidityLabel = (
  membership: Pick<MembershipPackage, 'expiresAt'>,
  now: Date = new Date(),
): string => {
  if (!membership.expiresAt) return '长期有效'
  if (isMembershipExpired(membership, now)) return '已过期'
  const days = Math.ceil((Date.parse(membership.expiresAt) - now.getTime()) / 86_400_000)
  return days <= 1 ? '今天到期' : `剩余 ${days} 天`
}

interface SlotInput {
  startsAt: string
  endsAt: string
  open: boolean
  occupied?: boolean
  lesson?: Lesson
  memberName?: string
  viewerMemberId: string
}

export interface PublicSlot {
  startsAt: string
  endsAt: string
  status: 'available' | 'occupied' | 'mine' | 'closed'
  label: string
}

export const buildPublicSlot = (slot: SlotInput): PublicSlot => {
  let status: PublicSlot['status'] = slot.open ? 'available' : 'closed'
  let label = slot.open ? '可预约' : '未开放'

  if (slot.lesson?.status === 'booked') {
    const mine = slot.lesson.memberId === slot.viewerMemberId
    status = mine ? 'mine' : 'occupied'
    label = mine ? '我的预约' : '已预约'
  } else if (slot.occupied) {
    status = 'occupied'
    label = '已预约'
  }

  return {
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    status,
    label,
  }
}

export interface LessonActions {
  canCancel: boolean
  cancelHint: string
  canComplete: boolean
  canAppeal: boolean
}

export const getLessonActions = (lesson: Lesson, now: Date): LessonActions => {
  const booked = lesson.status === 'booked'
  const ended = new Date(lesson.endsAt).getTime() <= now.getTime()
  const consumedAt =
    lesson.status === 'completed' || lesson.status === 'coach_cancelled_consumed'
      ? new Date(lesson.consumedAt)
      : undefined

  return {
    canCancel: booked && canMemberCancel(new Date(lesson.startsAt), now),
    cancelHint:
      booked && !canMemberCancel(new Date(lesson.startsAt), now)
        ? '不足 2 小时，请联系教练处理'
        : '',
    canComplete: booked && ended,
    canAppeal: consumedAt ? canSubmitAppeal(consumedAt, now) : false,
  }
}

export const switchableRole = (user: Pick<User, 'roles'>, current: UserRole): UserRole | null => {
  if (user.roles.length < 2) {
    return null
  }
  return current === 'member' && user.roles.includes('coach') ? 'coach' : 'member'
}
