export type CoachStatus = 'active' | 'inactive'
export type ProductStatus = 'published' | 'unpublished'
export type AppealStatus = 'pending' | 'approved' | 'rejected'
export type LessonStatus =
  | 'booked'
  | 'member_cancelled'
  | 'coach_cancelled_released'
  | 'coach_cancelled_consumed'
  | 'completed'

export interface Coach {
  id: string
  userId: string
  name: string
  phone: string
  specialty: string
  status: CoachStatus
  schedule: Array<{ date: string; time: string; member: string; course: string }>
  history: Array<{ date: string; member: string; status: string }>
}

export interface BalanceChange {
  id: string
  operation: 'purchase' | 'lock' | 'release' | 'consume' | 'appeal_refund' | 'manual_adjust'
  availableDelta: number
  lockedDelta: number
  usedDelta: number
  totalDelta: number
  createdAt: string
  note?: string
}

export interface MembershipPackage {
  id: string
  productName: string
  coachId: string
  coachName: string
  available: number
  locked: number
  used: number
  total: number
  purchasedAt: string
  changes: BalanceChange[]
}

export interface Member {
  id: string
  name: string
  phone: string
  joinedAt: string
  packages: MembershipPackage[]
  courseHistory: Array<{ date: string; course: string; coach: string; status: string }>
  orders: Array<{ id: string; productSnapshot: string; amount: number; paidAt: string }>
  feedback: Array<{ course: string; rating: number; comment: string }>
  appealIds: string[]
}

export interface Product {
  id: string
  name: string
  price: number
  lessons: number
  status: ProductStatus
  soldCount: number
}

export interface Booking {
  id: string
  date: string
  time: string
  coachId: string
  coachName: string
  memberId: string
  memberName: string
  status: LessonStatus
  packageName: string
  source: string
  timeline: Array<{ at: string; label: string; source: string }>
  ledger: Array<{ id: string; at: string; operation: string; delta: number; description: string }>
  feedback?: { rating?: number; comment?: string; submittedAt: string }
}

export interface Appeal {
  id: string
  lessonId: string
  memberId: string
  memberName: string
  coachName: string
  courseAt: string
  packageId: string
  reason: string
  note: string
  status: AppealStatus
  createdAt: string
  source: string
  balanceChanges: Booking['ledger']
  decisionNote?: string
  handledAt?: string
}

export interface Sale {
  id: string
  memberName: string
  productName: string
  amount: number
  paidAt: string
}

export interface AdminData {
  coaches: Coach[]
  members: Member[]
  products: Product[]
  bookings: Booking[]
  appeals: Appeal[]
  sales: Sale[]
}

export interface CoachInput {
  id?: string
  name: string
  phone: string
  specialty: string
}

export interface ProductInput {
  id?: string
  name: string
  price: number
  lessons: number
}

export interface AdminApi {
  getSession(): boolean
  login(username: string, password: string): Promise<void>
  logout(): Promise<void>
  loadData(): Promise<AdminData>
  saveCoach(input: CoachInput): Promise<void>
  setCoachStatus(id: string, status: CoachStatus): Promise<void>
  adjustPackage(packageId: string, delta: number, note: string): Promise<void>
  saveProduct(input: ProductInput): Promise<void>
  setProductStatus(id: string, status: ProductStatus): Promise<void>
  decideAppeal(id: string, decision: 'approve' | 'reject', decisionNote: string): Promise<void>
}
