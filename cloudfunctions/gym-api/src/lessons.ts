import { type Actor, assertCanAccessLesson } from './auth'
import {
  appendLedger,
  assertPackageInvariant,
  DomainError,
  type Feedback,
  isMembershipExpired,
  type Lesson,
  type Store,
} from './store'

export interface BookLessonInput {
  memberId: string
  coachId: string
  packageId: string
  startsAt: string
  requestId: string
  now: string
}

export const bookLesson = async (store: Store, input: BookLessonInput): Promise<Lesson> =>
  store.transaction(() => {
    const duplicate = store.lessons.find(
      (item) => item.memberId === input.memberId && item.requestId === input.requestId,
    )
    if (duplicate) return duplicate

    const coach = store.coaches.find((item) => item.id === input.coachId)
    if (coach?.status !== 'active') throw new DomainError('教练当前不可预约')
    const slot = store.schedules.find(
      (item) => item.coachId === input.coachId && item.startsAt === input.startsAt && item.open,
    )
    if (!slot) throw new DomainError('该时段未开放')
    if (new Date(slot.startsAt).getTime() <= new Date(input.now).getTime()) {
      throw new DomainError('不能预约已开始的课程')
    }
    const occupied = store.lessons.some(
      (item) =>
        item.coachId === input.coachId &&
        item.startsAt === input.startsAt &&
        item.status === 'booked',
    )
    if (occupied || slot.occupiedLessonId) throw new DomainError('该时段已被预约')
    const membership = store.packages.find((item) => item.id === input.packageId)
    if (!membership || membership.memberId !== input.memberId) {
      throw new DomainError('课包不存在')
    }
    if (membership.coachId !== input.coachId) throw new DomainError('课包与教练不匹配')
    if (membership.availableLessons < 1) throw new DomainError('可用课时不足')
    if (isMembershipExpired(membership, new Date(input.now))) {
      throw new DomainError('课包已过期，无法预约')
    }

    const lesson: Lesson = {
      id: store.nextId('lesson'),
      requestId: input.requestId,
      memberId: input.memberId,
      coachId: input.coachId,
      membershipPackageId: membership.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      status: 'booked',
    }
    membership.availableLessons -= 1
    membership.lockedLessons += 1
    assertPackageInvariant(membership)
    store.lessons.push(lesson)
    slot.occupiedLessonId = lesson.id
    appendLedger(store, {
      packageId: membership.id,
      lessonId: lesson.id,
      operation: 'lock',
      availableDelta: -1,
      lockedDelta: 1,
      usedDelta: 0,
      totalDelta: 0,
      createdAt: input.now,
      actorId: input.memberId,
    })
    return lesson
  })

const getBookedLessonAndPackage = (store: Store, lessonId: string) => {
  const lesson = store.lessons.find((item) => item.id === lessonId)
  if (!lesson) throw new DomainError('课程不存在')
  if (lesson.status !== 'booked') throw new DomainError('终态课程不能再次转换')
  const membership = store.packages.find((item) => item.id === lesson.membershipPackageId)
  if (!membership) throw new DomainError('课包不存在')
  return { lesson, membership }
}

const releaseLockedLesson = (
  store: Store,
  lesson: Lesson,
  membership: ReturnType<typeof getBookedLessonAndPackage>['membership'],
  now: string,
  actorId: string,
): void => {
  membership.availableLessons += 1
  membership.lockedLessons -= 1
  assertPackageInvariant(membership)
  appendLedger(store, {
    packageId: membership.id,
    lessonId: lesson.id,
    operation: 'release',
    availableDelta: 1,
    lockedDelta: -1,
    usedDelta: 0,
    totalDelta: 0,
    createdAt: now,
    actorId,
  })
}

const consumeLockedLesson = (
  store: Store,
  lesson: Lesson,
  membership: ReturnType<typeof getBookedLessonAndPackage>['membership'],
  now: string,
  actorId: string,
): void => {
  membership.lockedLessons -= 1
  membership.usedLessons += 1
  assertPackageInvariant(membership)
  appendLedger(store, {
    packageId: membership.id,
    lessonId: lesson.id,
    operation: 'consume',
    availableDelta: 0,
    lockedDelta: -1,
    usedDelta: 1,
    totalDelta: 0,
    createdAt: now,
    actorId,
  })
}

const clearSlotOccupancy = (store: Store, lesson: Lesson): void => {
  const slot = store.schedules.find(
    (item) => item.coachId === lesson.coachId && item.startsAt === lesson.startsAt,
  )
  if (slot?.occupiedLessonId === lesson.id) delete slot.occupiedLessonId
}

export const cancelLessonByMember = async (
  store: Store,
  memberId: string,
  lessonId: string,
  now: string,
): Promise<Lesson> =>
  store.transaction(() => {
    const { lesson, membership } = getBookedLessonAndPackage(store, lessonId)
    assertCanAccessLesson({ kind: 'member', id: memberId }, lesson)
    if (new Date(lesson.startsAt).getTime() - new Date(now).getTime() < 2 * 60 * 60 * 1000) {
      throw new DomainError('开课不足两小时不能自行取消')
    }
    releaseLockedLesson(store, lesson, membership, now, memberId)
    clearSlotOccupancy(store, lesson)
    lesson.status = 'member_cancelled'
    return lesson
  })

export const cancelLessonByCoach = async (
  store: Store,
  coachId: string,
  lessonId: string,
  consume: boolean,
  now: string,
): Promise<Lesson> =>
  store.transaction(() => {
    const { lesson, membership } = getBookedLessonAndPackage(store, lessonId)
    assertCanAccessLesson({ kind: 'coach', id: coachId }, lesson)
    if (consume) {
      consumeLockedLesson(store, lesson, membership, now, coachId)
      lesson.status = 'coach_cancelled_consumed'
      lesson.consumedAt = now
    } else {
      releaseLockedLesson(store, lesson, membership, now, coachId)
      lesson.status = 'coach_cancelled_released'
    }
    clearSlotOccupancy(store, lesson)
    return lesson
  })

export interface CompleteLessonInput {
  actor: Actor
  lessonId: string
  now: string
}

export const completeLesson = async (store: Store, input: CompleteLessonInput): Promise<Lesson> =>
  store.transaction(() => {
    const existing = store.lessons.find((item) => item.id === input.lessonId)
    if (!existing) throw new DomainError('课程不存在')
    if (input.actor.kind === 'admin') throw new DomainError('管理员不能完成课程')
    if (input.actor.kind !== 'system') assertCanAccessLesson(input.actor, existing)
    if (existing.status === 'completed') return existing
    const { lesson, membership } = getBookedLessonAndPackage(store, input.lessonId)

    const elapsed = new Date(input.now).getTime() - new Date(lesson.endsAt).getTime()
    if (input.actor.kind === 'system') {
      if (elapsed < 24 * 60 * 60 * 1000) throw new DomainError('结束未满24小时')
    } else if (elapsed < 0) {
      throw new DomainError('课程尚未结束')
    }

    consumeLockedLesson(store, lesson, membership, input.now, input.actor.id)
    clearSlotOccupancy(store, lesson)
    lesson.status = 'completed'
    lesson.completionSource = input.actor.kind
    lesson.consumedAt = input.now
    return lesson
  })

export const saveFeedback = async (
  store: Store,
  memberId: string,
  lessonId: string,
  feedback: Omit<Feedback, 'submittedAt'>,
  now: string,
): Promise<Lesson> =>
  store.transaction(() => {
    const lesson = store.lessons.find((item) => item.id === lessonId)
    if (!lesson || lesson.memberId !== memberId) throw new DomainError('课程不存在或无权限')
    if (lesson.status !== 'completed') throw new DomainError('只能评价已完成课程')
    if (lesson.feedback) throw new DomainError('反馈已经提交')
    if (
      feedback.rating !== undefined &&
      (!Number.isInteger(feedback.rating) || feedback.rating < 1 || feedback.rating > 5)
    ) {
      throw new DomainError('星级必须为1到5')
    }
    lesson.feedback = { ...feedback, submittedAt: now }
    return lesson
  })

export const autoCompleteDueLessons = async (store: Store, now: string): Promise<string[]> => {
  const threshold = new Date(now).getTime() - 24 * 60 * 60 * 1000
  const dueIds = store.lessons
    .filter(
      (lesson) => lesson.status === 'booked' && new Date(lesson.endsAt).getTime() <= threshold,
    )
    .map((lesson) => lesson.id)

  const completed: string[] = []
  for (const lessonId of dueIds) {
    await completeLesson(store, {
      actor: { kind: 'system', id: 'auto-complete-lessons' },
      lessonId,
      now,
    })
    completed.push(lessonId)
  }
  return completed
}
