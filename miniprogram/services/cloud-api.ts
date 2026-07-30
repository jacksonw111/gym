import { applyBulkAvailability, sortCoachLessons } from '../models/coach'
import { getLessonActions } from '../models/member'
import type {
  ApiRequest,
  ApiResponse,
  Appeal,
  Coach,
  Lesson,
  MembershipPackage,
  PackageProduct,
  User,
  UserRole,
} from '../shared/contracts'
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
  SessionView,
  SetDayAvailabilityInput,
  SetSlotAvailabilityInput,
  SubmitAppealInput,
} from './api'

interface PaymentParameters {
  timeStamp: string
  nonceStr: string
  package: string
  signType: 'MD5' | 'HMAC-SHA256' | 'RSA'
  paySign: string
}

interface PurchaseOrder {
  orderId: string
  payment: PaymentParameters
}

type BootstrapLesson = Lesson & {
  coachName?: string
  memberName?: string
  memberPhone?: string
}

interface BootstrapOrder {
  id: string
  membershipId?: string
  status: string
}

interface BootstrapData {
  profile: User
  role: UserRole
  packages: PackageProduct[]
  coaches: Coach[]
  memberships: MembershipPackage[]
  lessons: BootstrapLesson[]
  appeals: Appeal[]
  orders?: BootstrapOrder[]
}

const mutationRequestId = (): string =>
  `cloud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const statusText = {
  booked: '已预约',
  member_cancelled: '会员已取消',
  coach_cancelled_released: '教练取消 · 未消耗',
  coach_cancelled_consumed: '教练取消 · 已消耗 1 节',
  completed: '已完成',
}

export class CloudApi implements GymApi {
  private currentRole: UserRole = 'member'
  private roleInitialized = false

  async getSession(): Promise<SessionView> {
    const data = await this.bootstrap()
    if (!this.roleInitialized) {
      this.currentRole = data.role
      this.roleInitialized = true
    }
    return { user: data.profile, role: this.currentRole }
  }

  async switchRole(role: UserRole): Promise<SessionView> {
    const data = await this.bootstrap()
    if (!data.profile.roles.includes(role)) {
      throw new Error('当前账号没有该身份')
    }
    this.currentRole = role
    this.roleInitialized = true
    return { user: data.profile, role }
  }

  async getMemberHome(): Promise<MemberHomeView> {
    const data = await this.bootstrap()
    return {
      user: data.profile,
      products: data.packages,
      coaches: data.coaches,
      memberships: data.memberships,
      lessons: data.lessons,
    }
  }

  async purchasePackage(input: PurchasePackageInput): Promise<MembershipPackage> {
    const order = await this.call<PurchaseOrder, Omit<PurchasePackageInput, 'requestId'>>(
      'purchase',
      {
        productId: input.productId,
        coachId: input.coachId,
      },
      input.requestId,
    )
    await new Promise<void>((resolve, reject) => {
      wx.requestPayment({
        ...order.payment,
        success: () => resolve(),
        fail: (error) => reject(error),
      })
    })

    const refreshed = await this.bootstrap()
    const recordedOrder = refreshed.orders?.find((candidate) => candidate.id === order.orderId)
    const membership = recordedOrder?.membershipId
      ? refreshed.memberships.find((candidate) => candidate.id === recordedOrder.membershipId)
      : [...refreshed.memberships]
          .reverse()
          .find(
            (candidate) =>
              candidate.productId === input.productId && candidate.coachId === input.coachId,
          )
    if (!membership) {
      throw new Error('支付结果确认中，请稍后回到首页刷新')
    }
    return membership
  }

  async getCoachSchedule(coachId: string, date: string): Promise<CoachScheduleView> {
    const [data, slots] = await Promise.all([
      this.bootstrap(),
      this.call<CoachScheduleView['slots'], { coachId: string; date: string }>('getSchedule', {
        coachId,
        date,
      }),
    ])
    const coach = data.coaches.find((candidate) => candidate.id === coachId)
    if (!coach) {
      throw new Error('教练不存在')
    }
    return { coach, date, slots }
  }

  bookLesson(input: BookLessonInput): Promise<Lesson> {
    return this.call(
      'bookLesson',
      {
        coachId: input.coachId,
        packageId: input.membershipPackageId,
        startsAt: input.startsAt,
      },
      input.requestId,
    )
  }

  async listMemberLessons(): Promise<MemberLessonsView> {
    const data = await this.bootstrap()
    const views = data.lessons
      .filter((lesson) => lesson.memberId === data.profile.id)
      .map((lesson) => this.toLessonView(data, lesson))
    return {
      upcoming: sortCoachLessons(views.filter((lesson) => lesson.status === 'booked')),
      history: [...views.filter((lesson) => lesson.status !== 'booked')].sort(
        (left, right) => Date.parse(right.startsAt) - Date.parse(left.startsAt),
      ),
    }
  }

  async getLesson(lessonId: string): Promise<LessonView> {
    const data = await this.bootstrap()
    const lesson = data.lessons.find((candidate) => candidate.id === lessonId)
    if (!lesson) {
      throw new Error('课程不存在')
    }
    return this.toLessonView(data, lesson)
  }

  cancelLesson(input: LessonMutationInput): Promise<Lesson> {
    return this.call('cancelLesson', { lessonId: input.lessonId }, input.requestId)
  }

  async completeLesson(input: CompleteLessonInput): Promise<Lesson> {
    const lesson = await this.call<Lesson, { lessonId: string }>(
      'completeLesson',
      { lessonId: input.lessonId },
      input.requestId,
    )
    if (input.rating || input.comment?.trim()) {
      await this.call(
        'saveFeedback',
        {
          lessonId: input.lessonId,
          ...(input.rating ? { rating: input.rating } : {}),
          ...(input.comment?.trim() ? { comment: input.comment.trim() } : {}),
        },
        mutationRequestId(),
      )
    }
    return lesson
  }

  submitAppeal(input: SubmitAppealInput): Promise<Appeal> {
    return this.call(
      'createAppeal',
      {
        lessonId: input.lessonId,
        reason: input.reason,
        ...(input.note ? { note: input.note } : {}),
      },
      input.requestId,
    )
  }

  async getCoachDashboard(date: string): Promise<CoachDashboardView> {
    const data = await this.bootstrap()
    const coach = data.coaches.find((candidate) => candidate.userId === data.profile.id)
    if (!coach) {
      throw new Error('当前账号不是教练')
    }
    const lessons = data.lessons
      .filter((lesson) => lesson.coachId === coach.id && lesson.startsAt.slice(0, 10) === date)
      .map((lesson) => this.toLessonView(data, lesson))
    return { coach, lessons: sortCoachLessons(lessons) }
  }

  async getOwnCoachSchedule(date: string): Promise<CoachScheduleView> {
    const data = await this.bootstrap()
    const coach = data.coaches.find((candidate) => candidate.userId === data.profile.id)
    if (!coach) {
      throw new Error('当前账号不是教练')
    }
    return this.getCoachSchedule(coach.id, date)
  }

  async setCoachDayAvailability(input: SetDayAvailabilityInput) {
    const schedule = await this.getOwnCoachSchedule(input.date)
    const result = applyBulkAvailability(schedule.slots, input.open)
    await this.call(
      'setSchedule',
      {
        date: input.date,
        slots: result.slots.map(({ startsAt, endsAt, open }) => ({
          startsAt,
          endsAt,
          open,
        })),
      },
      input.requestId,
    )
    return result
  }

  async setCoachSlotAvailability(input: SetSlotAvailabilityInput): Promise<CoachScheduleView> {
    const schedule = await this.getOwnCoachSchedule(input.date)
    const target = schedule.slots.find((slot) => slot.startsAt === input.startsAt)
    if (!target) {
      throw new Error('时段不存在')
    }
    if (target.lesson?.status === 'booked') {
      throw new Error('已有预约，请先处理预约')
    }
    await this.call(
      'setSchedule',
      {
        date: input.date,
        slots: schedule.slots.map(({ startsAt, endsAt, open }) => ({
          startsAt,
          endsAt,
          open: startsAt === input.startsAt ? input.open : open,
        })),
      },
      input.requestId,
    )
    return this.getOwnCoachSchedule(input.date)
  }

  coachCancelLesson(input: CoachCancelInput): Promise<Lesson> {
    return this.call(
      'coachCancel',
      { lessonId: input.lessonId, consume: input.consumeLesson },
      input.requestId,
    )
  }

  coachCompleteLesson(input: LessonMutationInput): Promise<Lesson> {
    return this.call('completeLesson', { lessonId: input.lessonId }, input.requestId)
  }

  private bootstrap(): Promise<BootstrapData> {
    return this.call('bootstrap', {})
  }

  private async call<TData, TPayload>(
    action: string,
    payload: TPayload,
    requestId = mutationRequestId(),
  ): Promise<TData> {
    const request: ApiRequest<TPayload> = { action, requestId, payload }
    const response = await wx.cloud.callFunction({ name: 'gym-api', data: request })
    const result = response.result as ApiResponse<TData>
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return result.data
  }

  private toLessonView(data: BootstrapData, lesson: BootstrapLesson): LessonView {
    const coach = data.coaches.find((candidate) => candidate.id === lesson.coachId)
    const membership = data.memberships.find(
      (candidate) => candidate.id === lesson.membershipPackageId,
    )
    return {
      ...lesson,
      coachName: lesson.coachName ?? coach?.name ?? '教练',
      memberName: lesson.memberName ?? data.profile.name,
      memberPhone: lesson.memberPhone ?? data.profile.phone ?? '未留联系方式',
      packageName: membership?.productName ?? '训练课包',
      statusText: statusText[lesson.status],
      ...getLessonActions(lesson, new Date()),
      ...(data.appeals.find((appeal) => appeal.lessonId === lesson.id)
        ? { appeal: data.appeals.find((appeal) => appeal.lessonId === lesson.id) }
        : {}),
    }
  }
}
