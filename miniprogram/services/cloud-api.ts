import {
  applyBulkAvailability,
  mergeRemoteSchedule,
  type RemoteScheduleSlot,
  sortCoachLessons,
} from '../models/coach'
import { getLessonActions } from '../models/member'
import { formatShanghaiDate } from '../models/time-display'
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
  PurchaseResult,
  QueryPurchaseInput,
  SaveFeedbackInput,
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

interface PurchaseResponse {
  order: {
    id: string
  }
  payment: PaymentParameters
}

type BootstrapLesson = Lesson & {
  coachName?: string
  memberName?: string
  memberPhone?: string
}

interface BootstrapOrder {
  id: string
  status: 'pending' | 'paid'
  membershipId?: string
}

interface BootstrapData {
  profile: User
  roles: UserRole[]
  activeRole: UserRole
  packages: PackageProduct[]
  coaches: Coach[]
  memberships: MembershipPackage[]
  lessons: BootstrapLesson[]
  appeals: Appeal[]
  orders?: BootstrapOrder[]
}

interface WechatAdapter {
  cloud: {
    callFunction(input: { name: string; data: ApiRequest<unknown> }): Promise<{ result?: unknown }>
  }
  requestPayment(
    input: PaymentParameters & {
      success(): void
      fail(error: unknown): void
    },
  ): void
}

const getWechat = (): WechatAdapter => (globalThis as unknown as { wx: WechatAdapter }).wx

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
  private activeRole?: UserRole

  async getSession(): Promise<SessionView> {
    const data = await this.bootstrap()
    return { user: data.profile, role: data.activeRole }
  }

  async switchRole(role: UserRole): Promise<SessionView> {
    const current = await this.bootstrap()
    if (!current.profile.roles.includes(role)) {
      throw new Error('当前账号没有该身份')
    }
    this.activeRole = role
    const confirmed = await this.bootstrap()
    return { user: confirmed.profile, role: confirmed.activeRole }
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

  async purchasePackage(input: PurchasePackageInput): Promise<PurchaseResult> {
    const purchase = await this.call<PurchaseResponse, Omit<PurchasePackageInput, 'requestId'>>(
      'purchase',
      {
        productId: input.productId,
        coachId: input.coachId,
      },
      input.requestId,
    )

    try {
      await new Promise<void>((resolve, reject) => {
        getWechat().requestPayment({
          ...purchase.payment,
          success: () => resolve(),
          fail: (error) => reject(error),
        })
      })
    } catch {
      return {
        status: 'pending',
        orderId: purchase.order.id,
        requestId: input.requestId,
      }
    }

    return this.queryPurchase({
      orderId: purchase.order.id,
      requestId: input.requestId,
    })
  }

  async queryPurchase(input: QueryPurchaseInput): Promise<PurchaseResult> {
    const refreshed = await this.bootstrap(input.requestId)
    const order = refreshed.orders?.find((candidate) => candidate.id === input.orderId)
    if (order?.status !== 'paid' || !order.membershipId) {
      return { status: 'pending', orderId: input.orderId, requestId: input.requestId }
    }
    const membership = refreshed.memberships.find(
      (candidate) => candidate.id === order.membershipId,
    )
    if (!membership) {
      return { status: 'pending', orderId: input.orderId, requestId: input.requestId }
    }
    return { status: 'paid', membership }
  }

  async getCoachSchedule(coachId: string, date: string): Promise<CoachScheduleView> {
    const [data, remoteSlots] = await Promise.all([
      this.bootstrap(),
      this.call<RemoteScheduleSlot[], { coachId: string; date: string; includeClosed: boolean }>(
        'getSchedule',
        { coachId, date, includeClosed: true },
      ),
    ])
    const coach = data.coaches.find((candidate) => candidate.id === coachId)
    if (!coach) {
      throw new Error('教练不存在')
    }
    return {
      coach,
      date,
      slots: mergeRemoteSchedule(date, remoteSlots, data.lessons, coachId),
    }
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

  completeLesson(input: CompleteLessonInput): Promise<Lesson> {
    return this.call('completeLesson', { lessonId: input.lessonId }, input.requestId)
  }

  saveFeedback(input: SaveFeedbackInput): Promise<Lesson> {
    return this.call(
      'saveFeedback',
      {
        lessonId: input.lessonId,
        ...(input.rating ? { rating: input.rating } : {}),
        ...(input.comment?.trim() ? { comment: input.comment.trim() } : {}),
      },
      input.requestId,
    )
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
      .filter(
        (lesson) => lesson.coachId === coach.id && formatShanghaiDate(lesson.startsAt) === date,
      )
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

  private async bootstrap(requestId?: string): Promise<BootstrapData> {
    const data = await this.call<BootstrapData, { activeRole?: UserRole }>(
      'bootstrap',
      this.activeRole ? { activeRole: this.activeRole } : {},
      requestId,
    )
    const activeRole = data.activeRole ?? data.roles?.[0] ?? data.profile.roles[0]
    if (!activeRole) {
      throw new Error('当前账号没有可用身份')
    }
    this.activeRole = activeRole
    return { ...data, activeRole }
  }

  private async call<TData, TPayload>(
    action: string,
    payload: TPayload,
    requestId = mutationRequestId(),
  ): Promise<TData> {
    const request: ApiRequest<TPayload> = { action, requestId, payload }
    let response: { result?: unknown }
    try {
      response = await getWechat().cloud.callFunction({
        name: 'gym-api',
        data: request,
      })
    } catch (error) {
      const errMsg =
        error && typeof error === 'object' && 'errMsg' in error && typeof error.errMsg === 'string'
          ? error.errMsg
          : '云函数调用失败，请检查云环境与函数配置'
      throw new Error(errMsg)
    }
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
    const ownMemberLesson = lesson.memberId === data.profile.id
    return {
      ...lesson,
      coachName: lesson.coachName ?? coach?.name ?? '教练',
      memberName: lesson.memberName ?? (ownMemberLesson ? data.profile.name : '会员信息未提供'),
      memberPhone:
        lesson.memberPhone ??
        (ownMemberLesson ? (data.profile.phone ?? '会员信息未提供') : '会员信息未提供'),
      packageName: membership?.productName ?? '训练课包',
      statusText: statusText[lesson.status],
      ...getLessonActions(lesson, new Date()),
      canSaveFeedback: lesson.status === 'completed' && !lesson.feedback,
      ...(data.appeals.find((appeal) => appeal.lessonId === lesson.id)
        ? { appeal: data.appeals.find((appeal) => appeal.lessonId === lesson.id) }
        : {}),
    }
  }
}
