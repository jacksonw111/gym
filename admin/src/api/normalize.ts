import type {
  AdminData,
  Appeal,
  BalanceChange,
  Booking,
  Coach,
  Member,
  Product,
  ProductInput,
  Sale,
} from './types'

type RecordValue = Record<string, unknown>

const record = (value: unknown): RecordValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : {}

const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback
const number = (value: unknown): number => (typeof value === 'number' ? value : 0)

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const date = (value: unknown): string => {
  const parsed = new Date(text(value))
  if (Number.isNaN(parsed.getTime())) return '—'
  const parts = dateFormatter.formatToParts(parsed)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

const time = (value: unknown): string => {
  const parsed = new Date(text(value))
  return Number.isNaN(parsed.getTime()) ? '—' : timeFormatter.format(parsed)
}

const dateTime = (value: unknown): string => {
  const datePart = date(value)
  return datePart === '—' ? '—' : `${datePart} ${time(value)}`
}

const timeRange = (startsAt: unknown, endsAt: unknown): string =>
  `${time(startsAt)}–${time(endsAt)}`

const lessonStatus: Record<string, string> = {
  booked: '待上课',
  member_cancelled: '会员取消',
  coach_cancelled_released: '教练取消（已退课）',
  coach_cancelled_consumed: '教练取消（已扣课）',
  completed: '已完成',
}

const operationLabel: Record<string, string> = {
  purchase: '购买课包',
  lock: '锁定课时',
  release: '释放课时',
  consume: '核销课时',
  appeal_refund: '申诉退款',
  manual_adjust: '人工调课',
}

const deltaPart = (label: string, value: number): string | null =>
  value === 0 ? null : `${label} ${value > 0 ? '+' : ''}${value}`

const balanceDescription = (entry: RecordValue): string =>
  [
    deltaPart('可用', number(entry.availableDelta)),
    deltaPart('锁定', number(entry.lockedDelta)),
    deltaPart('已用', number(entry.usedDelta)),
    deltaPart('总课时', number(entry.totalDelta)),
  ]
    .filter(Boolean)
    .join(' / ')

const normalizeChange = (value: unknown): BalanceChange => {
  const entry = record(value)
  return {
    id: text(entry.id),
    operation: text(entry.operation, 'manual_adjust') as BalanceChange['operation'],
    availableDelta: number(entry.availableDelta),
    lockedDelta: number(entry.lockedDelta),
    usedDelta: number(entry.usedDelta),
    totalDelta: number(entry.totalDelta),
    createdAt: dateTime(entry.createdAt),
    ...(text(entry.note) ? { note: text(entry.note) } : {}),
  }
}

const sourceForLesson = (lesson: RecordValue): string => {
  switch (text(lesson.status)) {
    case 'completed': {
      const source = text(lesson.completionSource)
      if (source === 'coach') return '教练确认完成'
      if (source === 'system') return '系统确认完成'
      return '会员确认完成'
    }
    case 'member_cancelled':
      return '会员取消'
    case 'coach_cancelled_released':
      return '教练取消 · 已退课'
    case 'coach_cancelled_consumed':
      return '教练取消 · 已扣课'
    default:
      return '会员预约'
  }
}

export const toCloudProductInput = (input: ProductInput): RecordValue => ({
  ...(input.id ? { id: input.id } : {}),
  name: input.name,
  priceCents: Math.round(input.price * 100),
  lessonCount: input.lessons,
})

export const normalizeAdminData = (
  dashboardValue: unknown,
  bookingsValue: unknown,
  appealsValue: unknown,
): AdminData => {
  const dashboard = record(dashboardValue)
  const rawCoaches = array(dashboard.coaches).map(record)
  const rawMembers = array(dashboard.members).map(record)
  const rawProducts = array(dashboard.packages).map(record)
  const memberships = array(dashboard.memberships).map(record)
  const orders = array(dashboard.orders).map(record)
  const schedules = array(dashboard.schedules).map(record)
  const rawLedger = array(dashboard.ledger).map(record)
  const rawBookings = array(bookingsValue).map(record)
  const rawAppeals = array(appealsValue).map(record)

  const coachName = (id: unknown) =>
    text(rawCoaches.find((coach) => text(coach.id) === id)?.name, '未知教练')
  const memberName = (id: unknown) =>
    text(rawMembers.find((member) => text(member.id) === id)?.name, '未知会员')
  const membershipFor = (id: unknown) =>
    memberships.find((membership) => text(membership.id) === id)

  const bookingLedger = (lessonId: unknown) =>
    rawLedger
      .filter((entry) => text(entry.lessonId) === lessonId)
      .map((entry) => ({
        id: text(entry.id),
        at: dateTime(entry.createdAt),
        operation: operationLabel[text(entry.operation)] ?? text(entry.operation),
        delta: number(entry.availableDelta),
        description: balanceDescription(entry),
      }))

  const bookings: Booking[] = rawBookings.map((lesson) => {
    const membership = membershipFor(lesson.membershipPackageId)
    const source = sourceForLesson(lesson)
    const feedback = record(lesson.feedback)
    const ledger = bookingLedger(lesson.id)
    return {
      id: text(lesson.id),
      date: date(lesson.startsAt),
      time: timeRange(lesson.startsAt, lesson.endsAt),
      coachId: text(lesson.coachId),
      coachName: coachName(lesson.coachId),
      memberId: text(lesson.memberId),
      memberName: memberName(lesson.memberId),
      status: text(lesson.status, 'booked') as Booking['status'],
      packageName: text(membership?.productName, '未知课包'),
      source,
      timeline: [
        {
          at: dateTime(lesson.startsAt),
          label: lessonStatus[text(lesson.status)] ?? text(lesson.status),
          source,
        },
      ],
      ledger,
      ...(Object.keys(feedback).length > 0
        ? {
            feedback: {
              rating: number(feedback.rating) || undefined,
              comment: text(feedback.comment) || undefined,
              submittedAt: dateTime(feedback.submittedAt),
            },
          }
        : {}),
    }
  })

  const appeals: Appeal[] = rawAppeals.map((rawAppeal) => {
    const lesson = rawBookings.find((item) => text(item.id) === rawAppeal.lessonId)
    const membership = membershipFor(lesson?.membershipPackageId)
    return {
      id: text(rawAppeal.id),
      lessonId: text(rawAppeal.lessonId),
      memberId: text(rawAppeal.memberId),
      memberName: memberName(rawAppeal.memberId),
      coachName: coachName(lesson?.coachId),
      courseAt: `${date(lesson?.startsAt)} ${timeRange(lesson?.startsAt, lesson?.endsAt)}`,
      packageId: text(membership?.id),
      reason: text(rawAppeal.reason),
      note: text(rawAppeal.note),
      status: text(rawAppeal.status, 'pending') as Appeal['status'],
      createdAt: dateTime(rawAppeal.createdAt),
      source: lesson ? sourceForLesson(lesson) : '课程记录缺失',
      balanceChanges: bookingLedger(rawAppeal.lessonId),
      ...(text(rawAppeal.decisionNote) ? { decisionNote: text(rawAppeal.decisionNote) } : {}),
      ...(text(rawAppeal.handledAt) ? { handledAt: dateTime(rawAppeal.handledAt) } : {}),
    }
  })

  const products: Product[] = rawProducts.map((product) => ({
    id: text(product.id),
    name: text(product.name),
    price: number(product.priceCents) / 100,
    lessons: number(product.lessonCount),
    status: text(product.status, 'unpublished') as Product['status'],
    soldCount: orders.filter((order) => order.productId === product.id && order.status === 'paid')
      .length,
  }))

  const members: Member[] = rawMembers.map((member) => {
    const ownOrders = orders.filter((order) => order.memberId === member.id)
    const ownBookings = bookings.filter((booking) => booking.memberId === member.id)
    return {
      id: text(member.id),
      name: text(member.name),
      phone: text(member.phone, '未登记'),
      joinedAt: date(ownOrders[0]?.createdAt),
      packages: memberships
        .filter((membership) => membership.memberId === member.id)
        .map((membership) => ({
          id: text(membership.id),
          productName: text(membership.productName),
          coachId: text(membership.coachId),
          coachName: coachName(membership.coachId),
          available: number(membership.availableLessons),
          locked: number(membership.lockedLessons),
          used: number(membership.usedLessons),
          total: number(membership.totalLessons),
          purchasedAt: date(membership.purchasedAt),
          changes: rawLedger
            .filter((entry) => entry.packageId === membership.id)
            .map(normalizeChange),
        })),
      courseHistory: ownBookings.map((booking) => ({
        date: booking.date,
        course: booking.packageName,
        coach: booking.coachName,
        status: lessonStatus[booking.status] ?? booking.status,
      })),
      orders: ownOrders.map((order) => {
        const snapshot = record(order.productSnapshot)
        const amount = number(snapshot.priceCents) / 100
        return {
          id: text(order.id),
          productSnapshot: `${text(snapshot.name)} · ¥${amount} · ${number(snapshot.lessonCount)} 节`,
          amount,
          paidAt: date(order.paidAt ?? order.createdAt),
        }
      }),
      feedback: ownBookings
        .filter((booking) => booking.feedback)
        .map((booking) => ({
          course: booking.packageName,
          rating: booking.feedback?.rating ?? 0,
          comment: booking.feedback?.comment ?? '',
        })),
      appealIds: appeals
        .filter((appeal) => appeal.memberId === member.id)
        .map((appeal) => appeal.id),
    }
  })

  const coaches: Coach[] = rawCoaches.map((coach) => {
    const ownBookings = bookings.filter((booking) => booking.coachId === coach.id)
    return {
      id: text(coach.id),
      userId: text(coach.userId),
      name: text(coach.name),
      phone: text(coach.phone, '未登记'),
      specialty: text(coach.specialty, '未登记'),
      status: text(coach.status, 'inactive') as Coach['status'],
      schedule: schedules
        .filter((slot) => slot.coachId === coach.id)
        .map((slot) => {
          const lesson = rawBookings.find(
            (item) => item.coachId === coach.id && item.startsAt === slot.startsAt,
          )
          const membership = membershipFor(lesson?.membershipPackageId)
          return {
            date: date(slot.startsAt),
            time: timeRange(slot.startsAt, slot.endsAt),
            member: memberName(lesson?.memberId),
            course: text(membership?.productName, '开放时段'),
          }
        }),
      history: ownBookings
        .filter((booking) => booking.status !== 'booked')
        .map((booking) => ({
          date: booking.date,
          member: booking.memberName,
          status: lessonStatus[booking.status] ?? booking.status,
        })),
    }
  })

  const sales: Sale[] = orders
    .filter((order) => order.status === 'paid')
    .map((order) => {
      const snapshot = record(order.productSnapshot)
      return {
        id: text(order.id),
        memberName: memberName(order.memberId),
        productName: text(snapshot.name),
        amount: number(snapshot.priceCents) / 100,
        paidAt: dateTime(order.paidAt ?? order.createdAt),
      }
    })

  return { coaches, members, products, bookings, appeals, sales }
}
