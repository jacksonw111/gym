export type UserRole = 'member' | 'coach'

export interface User {
  id: string
  emasUserId: string
  name: string
  avatarUrl?: string
  phone?: string
  phoneVerified?: boolean
  roles: UserRole[]
}

export const hasRole = (user: Pick<User, 'roles'>, role: UserRole): boolean =>
  user.roles.includes(role)

export type CoachStatus = 'active' | 'inactive'

export interface Coach {
  id: string
  userId: string
  name: string
  avatarUrl?: string
  bio?: string
  phone?: string
  status: CoachStatus
}

export type PackageProductStatus = 'published' | 'unpublished'

export interface PackageProduct {
  id: string
  name: string
  priceCents: number
  lessonCount: number
  status: PackageProductStatus
}

export type LessonBalanceStatus = 'available' | 'locked' | 'used'

export interface MembershipPackage {
  id: string
  memberId: string
  coachId: string
  productId: string
  productName: string
  purchasePriceCents: number
  totalLessons: number
  availableLessons: number
  lockedLessons: number
  usedLessons: number
  purchasedAt: string
}

export type LessonStatus =
  | 'booked'
  | 'member_cancelled'
  | 'coach_cancelled_released'
  | 'coach_cancelled_consumed'
  | 'completed'

export type LessonCompletionSource = 'member' | 'coach' | 'system'

export interface LessonFeedback {
  rating?: 1 | 2 | 3 | 4 | 5
  comment?: string
  submittedAt: string
}

interface LessonBase {
  id: string
  memberId: string
  coachId: string
  membershipPackageId: string
  startsAt: string
  endsAt: string
}

interface BookedLesson extends LessonBase {
  status: 'booked'
  completionSource?: never
  consumedAt?: never
  feedback?: never
}

interface MemberCancelledLesson extends LessonBase {
  status: 'member_cancelled'
  completionSource?: never
  consumedAt?: never
  feedback?: never
}

interface CoachCancelledReleasedLesson extends LessonBase {
  status: 'coach_cancelled_released'
  completionSource?: never
  consumedAt?: never
  feedback?: never
}

interface CoachCancelledConsumedLesson extends LessonBase {
  status: 'coach_cancelled_consumed'
  completionSource?: never
  consumedAt: string
  feedback?: never
}

interface CompletedLesson extends LessonBase {
  status: 'completed'
  completionSource: LessonCompletionSource
  consumedAt: string
  feedback?: LessonFeedback
}

export type Lesson =
  | BookedLesson
  | MemberCancelledLesson
  | CoachCancelledReleasedLesson
  | CoachCancelledConsumedLesson
  | CompletedLesson

export type AppealStatus = 'pending' | 'approved' | 'rejected'

interface AppealBase {
  id: string
  lessonId: string
  memberId: string
  reason: string
  note?: string
  createdAt: string
}

interface PendingAppeal extends AppealBase {
  status: 'pending'
  handledBy?: never
  handledAt?: never
  decisionNote?: never
  refundedAt?: never
  lessonRefunded: false
}

interface ApprovedAppeal extends AppealBase {
  status: 'approved'
  handledBy: string
  handledAt: string
  decisionNote: string
  refundedAt: string
  lessonRefunded: true
}

interface RejectedAppeal extends AppealBase {
  status: 'rejected'
  handledBy: string
  handledAt: string
  decisionNote: string
  refundedAt?: never
  lessonRefunded: false
}

export type Appeal = PendingAppeal | ApprovedAppeal | RejectedAppeal

export interface ApiRequest<TPayload = unknown> {
  action: string
  requestId: string
  payload: TPayload
}

export type ApiResponse<TData = unknown> =
  | {
      ok: true
      data: TData
    }
  | {
      ok: false
      error: {
        code: string
        message: string
      }
    }
