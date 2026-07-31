import { applyBulkAvailability, buildDefaultSchedule, sortCoachLessons } from '../models/coach'
import { getLessonActions } from '../models/member'
import type { Appeal, Lesson, LessonStatus, MembershipPackage, UserRole } from '../shared/contracts'
import { canMemberCancel } from '../shared/time'
import type {
  BookLessonInput,
  CoachCancelInput,
  CoachDashboardView,
  CoachScheduleView,
  CompleteLessonInput,
  GymApi,
  LessonMutationInput,
  LessonView,
  MemberHomeView,
  MemberLessonsView,
  PurchasePackageInput,
  PurchaseResult,
  QueryPurchaseInput,
  RegisterMemberInput,
  RegisterTestMemberInput,
  SaveFeedbackInput,
  SessionView,
  SetDayAvailabilityInput,
  SetSlotAvailabilityInput,
  SubmitAppealInput,
} from './api'
import { type DevelopmentState, DevelopmentStore } from './development-store'

const statusText: Record<LessonStatus, string> = {
  booked: '已预约',
  member_cancelled: '会员已取消',
  coach_cancelled_released: '教练取消 · 未消耗',
  coach_cancelled_consumed: '教练取消 · 已消耗 1 节',
  completed: '已完成',
}

const availabilityKey = (coachId: string, date: string): string => `${coachId}:${date}`

const datePart = (dateTime: string): string => dateTime.slice(0, 10)

const required = <T>(value: T | undefined, message: string): T => {
  if (!value) {
    throw new Error(message)
  }
  return value
}

export class DevelopmentApi implements GymApi {
  constructor(
    private readonly store = new DevelopmentStore(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getSession(): Promise<SessionView> {
    const state = this.store.read()
    return { authenticated: true, user: state.user, role: state.role }
  }

  async registerMember(input: RegisterMemberInput): Promise<SessionView> {
    const next = this.store.update((draft) => {
      draft.user.name = input.name.trim()
      draft.user.avatarUrl = input.avatarUrl
      draft.user.phone = draft.user.phone ?? '13800000000'
    })
    return { authenticated: true, user: next.user, role: next.role }
  }

  async registerTestMember(input: RegisterTestMemberInput): Promise<SessionView> {
    const next = this.store.update((draft) => {
      draft.user.name = input.name?.trim() || '模拟器测试会员'
      draft.user.phone = '13800000000'
    })
    return { authenticated: true, user: next.user, role: next.role }
  }

  async switchRole(role: UserRole): Promise<SessionView> {
    const state = this.store.read()
    if (!state.user.roles.includes(role)) {
      throw new Error('当前账号没有该身份')
    }
    const next = this.store.update((draft) => {
      draft.role = role
    })
    return { authenticated: true, user: next.user, role: next.role }
  }

  async getMemberHome(): Promise<MemberHomeView> {
    const state = this.store.read()
    return {
      authenticated: true,
      user: state.user,
      products: state.products.filter((product) => product.status === 'published'),
      coaches: state.coaches.filter((coach) => coach.status === 'active'),
      memberships: state.memberships,
      lessons: state.lessons,
    }
  }

  async purchasePackage(input: PurchasePackageInput): Promise<PurchaseResult> {
    const state = this.store.read()
    const existingId = state.requests[input.requestId]
    if (existingId) {
      return {
        status: 'paid',
        membership: required(
          state.memberships.find((membership) => membership.id === existingId),
          '测试购买记录不存在',
        ),
      }
    }
    const product = required(
      state.products.find(
        (candidate) => candidate.id === input.productId && candidate.status === 'published',
      ),
      '课包已下架',
    )
    required(
      state.coaches.find(
        (candidate) => candidate.id === input.coachId && candidate.status === 'active',
      ),
      '教练当前不可选',
    )
    const membership: MembershipPackage = {
      id: `membership-${input.requestId}`,
      memberId: state.user.id,
      coachId: input.coachId,
      productId: product.id,
      productName: product.name,
      purchasePriceCents: product.priceCents,
      totalLessons: product.lessonCount,
      availableLessons: product.lessonCount,
      lockedLessons: 0,
      usedLessons: 0,
      purchasedAt: this.now().toISOString(),
    }
    this.store.update((draft) => {
      draft.memberships.push(membership)
      draft.requests[input.requestId] = membership.id
    })
    return { status: 'paid', membership }
  }

  async queryPurchase(input: QueryPurchaseInput): Promise<PurchaseResult> {
    const state = this.store.read()
    const membershipId = state.requests[input.requestId]
    const membership = state.memberships.find(
      (candidate) => candidate.id === membershipId || candidate.id === input.orderId,
    )
    if (!membership) {
      return { status: 'pending', orderId: input.orderId, requestId: input.requestId }
    }
    return { status: 'paid', membership }
  }

  async getCoachSchedule(coachId: string, date: string): Promise<CoachScheduleView> {
    const state = this.store.read()
    const coach = required(
      state.coaches.find((candidate) => candidate.id === coachId),
      '教练不存在',
    )
    const availability = state.availability[availabilityKey(coachId, date)] ?? {}
    const slots = buildDefaultSchedule(date).map((slot) => {
      const lesson = state.lessons.find(
        (candidate) =>
          candidate.coachId === coachId &&
          candidate.startsAt === slot.startsAt &&
          candidate.status === 'booked',
      )
      return {
        ...slot,
        open: availability[slot.startsAt] ?? true,
        ...(lesson ? { lesson, locked: true, memberName: state.user.name } : {}),
      }
    })
    return { coach, date, slots }
  }

  async bookLesson(input: BookLessonInput): Promise<Lesson> {
    const state = this.store.read()
    const existingId = state.requests[input.requestId]
    if (existingId) {
      return required(
        state.lessons.find((lesson) => lesson.id === existingId),
        '预约记录不存在',
      )
    }
    const membership = required(
      state.memberships.find((candidate) => candidate.id === input.membershipPackageId),
      '课包不存在',
    )
    if (membership.coachId !== input.coachId || membership.availableLessons < 1) {
      throw new Error('请选择当前教练且有可用课时的课包')
    }
    if (Date.parse(input.startsAt) <= this.now().getTime()) {
      throw new Error('只能预约尚未开始的时段')
    }
    const schedule = await this.getCoachSchedule(input.coachId, datePart(input.startsAt))
    const slot = required(
      schedule.slots.find((candidate) => candidate.startsAt === input.startsAt),
      '时段不存在',
    )
    if (!slot.open || slot.lesson) {
      throw new Error(slot.lesson ? '该时段刚刚被预约' : '该时段未开放')
    }
    const lesson: Lesson = {
      id: `lesson-${input.requestId}`,
      memberId: state.user.id,
      coachId: input.coachId,
      membershipPackageId: membership.id,
      startsAt: input.startsAt,
      endsAt: slot.endsAt,
      status: 'booked',
    }
    this.store.update((draft) => {
      const target = required(
        draft.memberships.find((candidate) => candidate.id === membership.id),
        '课包不存在',
      )
      target.availableLessons -= 1
      target.lockedLessons += 1
      draft.lessons.push(lesson)
      draft.requests[input.requestId] = lesson.id
    })
    return lesson
  }

  async listMemberLessons(): Promise<MemberLessonsView> {
    const state = this.store.read()
    const views = state.lessons
      .filter((lesson) => lesson.memberId === state.user.id)
      .map((lesson) => this.toLessonView(state, lesson))
    return {
      upcoming: sortCoachLessons(views.filter((lesson) => lesson.status === 'booked')),
      history: [...views.filter((lesson) => lesson.status !== 'booked')].sort(
        (left, right) => Date.parse(right.startsAt) - Date.parse(left.startsAt),
      ),
    }
  }

  async getLesson(lessonId: string): Promise<LessonView> {
    const state = this.store.read()
    return this.toLessonView(
      state,
      required(
        state.lessons.find((lesson) => lesson.id === lessonId),
        '课程不存在',
      ),
    )
  }

  async cancelLesson(input: LessonMutationInput): Promise<Lesson> {
    return this.transitionBooked(input, (lesson, draft) => {
      if (!canMemberCancel(new Date(lesson.startsAt), this.now())) {
        throw new Error('不足 2 小时，请联系教练处理')
      }
      this.adjustLockedLesson(draft, lesson.membershipPackageId, false)
      return { ...lesson, status: 'member_cancelled' }
    })
  }

  async completeLesson(input: CompleteLessonInput): Promise<Lesson> {
    return this.transitionBooked(input, (lesson, draft) => {
      if (new Date(lesson.endsAt).getTime() > this.now().getTime()) {
        throw new Error('课程结束后才能确认完成')
      }
      this.adjustLockedLesson(draft, lesson.membershipPackageId, true)
      return {
        ...lesson,
        status: 'completed',
        completionSource: 'member',
        consumedAt: this.now().toISOString(),
      }
    })
  }

  async saveFeedback(input: SaveFeedbackInput): Promise<Lesson> {
    const state = this.store.read()
    const existingId = state.requests[input.requestId]
    if (existingId) {
      return required(
        state.lessons.find((lesson) => lesson.id === existingId),
        '课程记录不存在',
      )
    }
    const lesson = required(
      state.lessons.find((candidate) => candidate.id === input.lessonId),
      '课程不存在',
    )
    if (lesson.status !== 'completed') {
      throw new Error('课程完成后才能反馈')
    }
    if (lesson.feedback) {
      throw new Error('该课程已提交反馈')
    }
    if (!input.rating && !input.comment?.trim()) {
      throw new Error('请填写星级或训练感受')
    }
    const next: Lesson = {
      ...lesson,
      feedback: {
        ...(input.rating ? { rating: input.rating } : {}),
        ...(input.comment?.trim() ? { comment: input.comment.trim() } : {}),
        submittedAt: this.now().toISOString(),
      },
    }
    this.store.update((draft) => {
      const index = draft.lessons.findIndex((candidate) => candidate.id === lesson.id)
      draft.lessons[index] = next
      draft.requests[input.requestId] = lesson.id
    })
    return next
  }

  async submitAppeal(input: SubmitAppealInput): Promise<Appeal> {
    if (!input.reason.trim()) {
      throw new Error('请填写申诉理由')
    }
    const state = this.store.read()
    const existingId = state.requests[input.requestId]
    if (existingId) {
      return required(
        state.appeals.find((appeal) => appeal.id === existingId),
        '申诉记录不存在',
      )
    }
    if (state.appeals.some((appeal) => appeal.lessonId === input.lessonId)) {
      throw new Error('该课程已提交申诉')
    }
    const lesson = this.toLessonView(
      state,
      required(
        state.lessons.find((candidate) => candidate.id === input.lessonId),
        '课程不存在',
      ),
    )
    if (!lesson.canAppeal) {
      throw new Error('当前课程不在可申诉期限内')
    }
    const appeal: Appeal = {
      id: `appeal-${input.requestId}`,
      lessonId: lesson.id,
      memberId: state.user.id,
      reason: input.reason.trim(),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      createdAt: this.now().toISOString(),
      status: 'pending',
      lessonRefunded: false,
    }
    this.store.update((draft) => {
      draft.appeals.push(appeal)
      draft.requests[input.requestId] = appeal.id
    })
    return appeal
  }

  async getCoachDashboard(date: string): Promise<CoachDashboardView> {
    const state = this.store.read()
    const coach = required(state.coaches[0], '教练不存在')
    const lessons = state.lessons
      .filter((lesson) => lesson.coachId === coach.id && datePart(lesson.startsAt) === date)
      .map((lesson) => this.toLessonView(state, lesson))
    return { coach, lessons: sortCoachLessons(lessons) }
  }

  async getOwnCoachSchedule(date: string): Promise<CoachScheduleView> {
    const coach = required(this.store.read().coaches[0], '教练不存在')
    return this.getCoachSchedule(coach.id, date)
  }

  async setCoachDayAvailability(
    input: SetDayAvailabilityInput,
  ): Promise<ReturnType<typeof applyBulkAvailability>> {
    const schedule = await this.getOwnCoachSchedule(input.date)
    const result = applyBulkAvailability(schedule.slots, input.open)
    this.store.update((draft) => {
      draft.availability[availabilityKey(schedule.coach.id, input.date)] = Object.fromEntries(
        result.slots.map((slot) => [slot.startsAt, slot.open]),
      )
    })
    return result
  }

  async setCoachSlotAvailability(input: SetSlotAvailabilityInput): Promise<CoachScheduleView> {
    const schedule = await this.getOwnCoachSchedule(input.date)
    const slot = required(
      schedule.slots.find((candidate) => candidate.startsAt === input.startsAt),
      '时段不存在',
    )
    if (slot.lesson?.status === 'booked') {
      throw new Error('已有预约，请先处理预约')
    }
    this.store.update((draft) => {
      const key = availabilityKey(schedule.coach.id, input.date)
      draft.availability[key] = {
        ...(draft.availability[key] ?? {}),
        [input.startsAt]: input.open,
      }
    })
    return this.getOwnCoachSchedule(input.date)
  }

  async coachCancelLesson(input: CoachCancelInput): Promise<Lesson> {
    return this.transitionBooked(input, (lesson, draft) => {
      this.adjustLockedLesson(draft, lesson.membershipPackageId, input.consumeLesson)
      return input.consumeLesson
        ? {
            ...lesson,
            status: 'coach_cancelled_consumed',
            consumedAt: this.now().toISOString(),
          }
        : { ...lesson, status: 'coach_cancelled_released' }
    })
  }

  async coachCompleteLesson(input: LessonMutationInput): Promise<Lesson> {
    return this.transitionBooked(input, (lesson, draft) => {
      if (new Date(lesson.endsAt).getTime() > this.now().getTime()) {
        throw new Error('课程结束后才能确认完成')
      }
      this.adjustLockedLesson(draft, lesson.membershipPackageId, true)
      return {
        ...lesson,
        status: 'completed',
        completionSource: 'coach',
        consumedAt: this.now().toISOString(),
      }
    })
  }

  private async transitionBooked(
    input: LessonMutationInput,
    transition: (lesson: Extract<Lesson, { status: 'booked' }>, state: DevelopmentState) => Lesson,
  ): Promise<Lesson> {
    const state = this.store.read()
    const existingId = state.requests[input.requestId]
    if (existingId) {
      return required(
        state.lessons.find((lesson) => lesson.id === existingId),
        '课程记录不存在',
      )
    }
    const lesson = required(
      state.lessons.find((candidate) => candidate.id === input.lessonId),
      '课程不存在',
    )
    if (lesson.status !== 'booked') {
      throw new Error('课程已处理，请刷新查看')
    }
    let next: Lesson | undefined
    this.store.update((draft) => {
      const current = required(
        draft.lessons.find((candidate) => candidate.id === input.lessonId),
        '课程不存在',
      )
      if (current.status !== 'booked') {
        throw new Error('课程已处理，请刷新查看')
      }
      const transitioned = transition(current, draft)
      next = transitioned
      const index = draft.lessons.findIndex((candidate) => candidate.id === lesson.id)
      draft.lessons[index] = transitioned
      draft.requests[input.requestId] = lesson.id
    })
    return required(next, '课程处理失败')
  }

  private adjustLockedLesson(
    state: DevelopmentState,
    membershipId: string,
    consume: boolean,
  ): void {
    const membership = required(
      state.memberships.find((candidate) => candidate.id === membershipId),
      '课包不存在',
    )
    membership.lockedLessons -= 1
    if (consume) {
      membership.usedLessons += 1
    } else {
      membership.availableLessons += 1
    }
  }

  private toLessonView(state: DevelopmentState, lesson: Lesson): LessonView {
    const coach = required(
      state.coaches.find((candidate) => candidate.id === lesson.coachId),
      '教练不存在',
    )
    const membership = required(
      state.memberships.find((candidate) => candidate.id === lesson.membershipPackageId),
      '课包不存在',
    )
    const actions = getLessonActions(lesson, this.now())
    return {
      ...lesson,
      coachName: coach.name,
      memberName: state.user.name,
      memberPhone: state.user.phone ?? '未留联系方式',
      packageName: membership.productName,
      statusText: statusText[lesson.status],
      ...actions,
      canSaveFeedback: lesson.status === 'completed' && !lesson.feedback,
      ...(state.appeals.find((appeal) => appeal.lessonId === lesson.id)
        ? { appeal: state.appeals.find((appeal) => appeal.lessonId === lesson.id) }
        : {}),
    }
  }
}
