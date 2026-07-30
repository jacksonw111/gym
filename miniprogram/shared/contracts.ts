export type UserRole = 'member' | 'coach'

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

export interface Lesson {
  id: string
  memberId: string
  coachId: string
  membershipPackageId: string
  startsAt: string
  endsAt: string
  status: LessonStatus
  completionSource?: LessonCompletionSource
  consumedAt?: string
  feedback?: LessonFeedback
}

export type AppealStatus = 'pending' | 'approved' | 'rejected'

export interface Appeal {
  id: string
  lessonId: string
  memberId: string
  reason: string
  note?: string
  status: AppealStatus
  createdAt: string
  decidedBy?: string
  decidedAt?: string
  decisionNote?: string
  lessonRefunded: boolean
}

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
