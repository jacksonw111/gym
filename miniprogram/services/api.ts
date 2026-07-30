import type { BulkAvailabilityResult, CoachScheduleSlot } from '../models/coach'
import type {
  Appeal,
  Coach,
  Lesson,
  MembershipPackage,
  PackageProduct,
  User,
  UserRole,
} from '../shared/contracts'

export type SessionView =
  | { authenticated: false }
  | { authenticated: true; user: User; role: UserRole }

export interface MemberHomeView {
  authenticated: boolean
  user?: User
  products: PackageProduct[]
  coaches: Coach[]
  memberships: MembershipPackage[]
  lessons: Lesson[]
}

export interface CoachScheduleView {
  coach: Coach
  date: string
  slots: CoachScheduleSlot[]
}

export type LessonView = Lesson & {
  coachName: string
  memberName: string
  memberPhone: string
  packageName: string
  statusText: string
  canCancel: boolean
  cancelHint: string
  canComplete: boolean
  canAppeal: boolean
  canSaveFeedback: boolean
  appeal?: Appeal
}

export interface MemberLessonsView {
  upcoming: LessonView[]
  history: LessonView[]
}

export interface CoachDashboardView {
  coach: Coach
  lessons: LessonView[]
}

export interface PurchasePackageInput {
  productId: string
  coachId: string
  requestId: string
}

export type PurchaseResult =
  | {
      status: 'paid'
      membership: MembershipPackage
    }
  | {
      status: 'pending'
      orderId: string
      requestId: string
    }

export interface QueryPurchaseInput {
  orderId: string
  requestId: string
}

export interface BookLessonInput {
  coachId: string
  membershipPackageId: string
  startsAt: string
  requestId: string
}

export interface LessonMutationInput {
  lessonId: string
  requestId: string
}

export type CompleteLessonInput = LessonMutationInput

export interface SaveFeedbackInput extends LessonMutationInput {
  rating?: 1 | 2 | 3 | 4 | 5
  comment?: string
}

export interface SubmitAppealInput extends LessonMutationInput {
  reason: string
  note?: string
}

export interface SetDayAvailabilityInput {
  date: string
  open: boolean
  requestId: string
}

export interface SetSlotAvailabilityInput {
  date: string
  startsAt: string
  open: boolean
  requestId: string
}

export interface CoachCancelInput extends LessonMutationInput {
  consumeLesson: boolean
}

export interface RegisterMemberInput {
  name: string
  avatarUrl: string
  phoneCloudId: string
  requestId: string
}

export interface GymApi {
  getSession(): Promise<SessionView>
  registerMember(input: RegisterMemberInput): Promise<SessionView>
  switchRole(role: UserRole): Promise<SessionView>
  getMemberHome(): Promise<MemberHomeView>
  purchasePackage(input: PurchasePackageInput): Promise<PurchaseResult>
  queryPurchase(input: QueryPurchaseInput): Promise<PurchaseResult>
  getCoachSchedule(coachId: string, date: string): Promise<CoachScheduleView>
  bookLesson(input: BookLessonInput): Promise<Lesson>
  listMemberLessons(): Promise<MemberLessonsView>
  getLesson(lessonId: string): Promise<LessonView>
  cancelLesson(input: LessonMutationInput): Promise<Lesson>
  completeLesson(input: CompleteLessonInput): Promise<Lesson>
  saveFeedback(input: SaveFeedbackInput): Promise<Lesson>
  submitAppeal(input: SubmitAppealInput): Promise<Appeal>
  getCoachDashboard(date: string): Promise<CoachDashboardView>
  getOwnCoachSchedule(date: string): Promise<CoachScheduleView>
  setCoachDayAvailability(input: SetDayAvailabilityInput): Promise<BulkAvailabilityResult>
  setCoachSlotAvailability(input: SetSlotAvailabilityInput): Promise<CoachScheduleView>
  coachCancelLesson(input: CoachCancelInput): Promise<Lesson>
  coachCompleteLesson(input: LessonMutationInput): Promise<Lesson>
}

let apiInstance: GymApi | undefined

export const registerApi = (api: GymApi): void => {
  apiInstance = api
}

export const getApi = (): GymApi => {
  if (!apiInstance) {
    throw new Error('服务尚未初始化')
  }
  return apiInstance
}

export const createRequestId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
