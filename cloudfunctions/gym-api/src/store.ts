export type UserRole = 'member' | 'coach'

export interface User {
  id: string
  openId: string
  name: string
  avatarUrl?: string
  phone?: string
  phoneVerified?: boolean
  roles: UserRole[]
}

export interface Coach {
  id: string
  userId?: string
  name: string
  phone?: string
  specialty?: string
  status: 'active' | 'inactive'
}

export interface Product {
  id: string
  name: string
  priceCents: number
  lessonCount: number
  coachId?: string
  status: 'published' | 'unpublished'
  /** 有效期天数；未设置时长期有效 */
  validDays?: number
}

export interface MembershipPackage {
  id: string
  memberId: string
  coachId: string
  coachName: string
  productId: string
  productName: string
  purchasePriceCents: number
  totalLessons: number
  availableLessons: number
  lockedLessons: number
  usedLessons: number
  purchasedAt: string
  /** 到期时间；未设置时长期有效。购买时由课包有效期快照而来 */
  expiresAt?: string
}

export interface Order {
  id: string
  requestId: string
  memberId: string
  coachId: string
  coachName: string
  productId: string
  productSnapshot: {
    id: string
    name: string
    priceCents: number
    lessonCount: number
    validDays?: number
  }
  status: 'pending' | 'paid'
  createdAt: string
  paidAt?: string
  paymentId?: string
  packageId?: string
}

export interface ScheduleSlot {
  id: string
  coachId: string
  startsAt: string
  endsAt: string
  open: boolean
}

export type LessonStatus =
  | 'booked'
  | 'member_cancelled'
  | 'coach_cancelled_released'
  | 'coach_cancelled_consumed'
  | 'completed'

export interface Feedback {
  rating?: 1 | 2 | 3 | 4 | 5
  comment?: string
  submittedAt: string
}

export interface Lesson {
  id: string
  requestId: string
  memberId: string
  coachId: string
  membershipPackageId: string
  startsAt: string
  endsAt: string
  status: LessonStatus
  completionSource?: 'member' | 'coach' | 'system'
  consumedAt?: string
  feedback?: Feedback
}

export interface Appeal {
  id: string
  lessonId: string
  memberId: string
  reason: string
  note?: string
  createdAt: string
  status: 'pending' | 'approved' | 'rejected'
  handledBy?: string
  handledAt?: string
  decisionNote?: string
  refundedAt?: string
  lessonRefunded: boolean
}

export type LedgerOperation =
  | 'purchase'
  | 'lock'
  | 'release'
  | 'consume'
  | 'appeal_refund'
  | 'manual_adjust'

export interface LedgerEntry {
  id: string
  packageId: string
  lessonId?: string
  operation: LedgerOperation
  availableDelta: number
  lockedDelta: number
  usedDelta: number
  totalDelta: number
  createdAt: string
  actorId?: string
  note?: string
}

export interface Admin {
  id: string
  username: string
  passwordHash: string
}

export interface AdminSession {
  id: string
  token: string
  adminId: string
  expiresAt: string
}

export interface StoreSeed {
  users?: User[]
  coaches?: Coach[]
  products?: Product[]
  packages?: MembershipPackage[]
  orders?: Order[]
  schedules?: ScheduleSlot[]
  lessons?: Lesson[]
  appeals?: Appeal[]
  ledger?: LedgerEntry[]
  admins?: Admin[]
  sessions?: AdminSession[]
}

export const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export interface Store {
  users: User[]
  coaches: Coach[]
  products: Product[]
  packages: MembershipPackage[]
  orders: Order[]
  schedules: ScheduleSlot[]
  lessons: Lesson[]
  appeals: Appeal[]
  ledger: LedgerEntry[]
  admins: Admin[]
  sessions: AdminSession[]
  transaction<T>(work: () => Promise<T> | T): Promise<T>
  nextId(prefix: string): string
}

export class DomainError extends Error {}

export class MemoryStore implements Store {
  users: User[]
  coaches: Coach[]
  products: Product[]
  packages: MembershipPackage[]
  orders: Order[]
  schedules: ScheduleSlot[]
  lessons: Lesson[]
  appeals: Appeal[]
  ledger: LedgerEntry[]
  admins: Admin[]
  sessions: AdminSession[]
  private counter = 0
  private queue: Promise<void> = Promise.resolve()

  constructor(seed: StoreSeed = {}) {
    this.users = cloneJson(seed.users ?? [])
    this.coaches = cloneJson(seed.coaches ?? [])
    this.products = cloneJson(seed.products ?? [])
    this.packages = cloneJson(seed.packages ?? [])
    this.orders = cloneJson(seed.orders ?? [])
    this.schedules = cloneJson(seed.schedules ?? [])
    this.lessons = cloneJson(seed.lessons ?? [])
    this.appeals = cloneJson(seed.appeals ?? [])
    this.ledger = cloneJson(seed.ledger ?? [])
    this.admins = cloneJson(seed.admins ?? [])
    this.sessions = cloneJson(seed.sessions ?? [])
  }

  async transaction<T>(work: () => Promise<T> | T): Promise<T> {
    let release = (): void => undefined
    const previous = this.queue
    this.queue = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    const snapshot: StoreSeed = cloneJson({
      users: this.users,
      coaches: this.coaches,
      products: this.products,
      packages: this.packages,
      orders: this.orders,
      schedules: this.schedules,
      lessons: this.lessons,
      appeals: this.appeals,
      ledger: this.ledger,
      admins: this.admins,
      sessions: this.sessions,
    })
    const counter = this.counter
    try {
      return await work()
    } catch (error) {
      this.users = snapshot.users ?? []
      this.coaches = snapshot.coaches ?? []
      this.products = snapshot.products ?? []
      this.packages = snapshot.packages ?? []
      this.orders = snapshot.orders ?? []
      this.schedules = snapshot.schedules ?? []
      this.lessons = snapshot.lessons ?? []
      this.appeals = snapshot.appeals ?? []
      this.ledger = snapshot.ledger ?? []
      this.admins = snapshot.admins ?? []
      this.sessions = snapshot.sessions ?? []
      this.counter = counter
      throw error
    } finally {
      release()
    }
  }

  nextId(prefix: string): string {
    this.counter += 1
    return `${prefix}-${this.counter}`
  }
}

export const assertPackageInvariant = (membership: MembershipPackage): void => {
  if (
    membership.availableLessons < 0 ||
    membership.lockedLessons < 0 ||
    membership.usedLessons < 0 ||
    membership.availableLessons + membership.lockedLessons + membership.usedLessons !==
      membership.totalLessons
  ) {
    throw new DomainError('课时余额不合法')
  }
}

export const isMembershipExpired = (membership: MembershipPackage, now: Date): boolean =>
  Boolean(membership.expiresAt && new Date(membership.expiresAt).getTime() < now.getTime())

export const membershipHasBalance = (membership: MembershipPackage): boolean =>
  membership.availableLessons + membership.lockedLessons > 0

export const appendLedger = (store: Store, entry: Omit<LedgerEntry, 'id'>): LedgerEntry => {
  const created = { ...entry, id: store.nextId('ledger') }
  store.ledger.push(created)
  return created
}
