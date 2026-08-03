import type {
  Appeal,
  Coach,
  Lesson,
  MembershipPackage,
  PackageProduct,
  User,
  UserRole,
} from '../shared/contracts'

export interface StorageAdapter {
  get(): unknown
  set(value: unknown): void
  clear(): void
}

export interface DevelopmentState {
  user: User
  role: UserRole
  coaches: Coach[]
  products: PackageProduct[]
  memberships: MembershipPackage[]
  lessons: Lesson[]
  appeals: Appeal[]
  availability: Record<string, Record<string, boolean>>
  requests: Record<string, string>
}

const STORAGE_KEY = 'purui-gym-development-state-v1'

class WechatStorage implements StorageAdapter {
  get(): unknown {
    return this.wechat().getStorageSync(STORAGE_KEY)
  }

  set(value: unknown): void {
    this.wechat().setStorageSync(STORAGE_KEY, value)
  }

  clear(): void {
    this.wechat().removeStorageSync(STORAGE_KEY)
  }

  private wechat(): {
    getStorageSync(key: string): unknown
    setStorageSync(key: string, value: unknown): void
    removeStorageSync(key: string): void
  } {
    return (
      globalThis as unknown as {
        wx: {
          getStorageSync(key: string): unknown
          setStorageSync(key: string, value: unknown): void
          removeStorageSync(key: string): void
        }
      }
    ).wx
  }
}

const localDate = (date: Date): string => {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  return shifted.toISOString().slice(0, 10)
}

const atLocalHour = (date: Date, hour: number): string =>
  `${localDate(date)}T${String(hour).padStart(2, '0')}:00:00+08:00`

const createSeed = (now: Date): DevelopmentState => {
  const historyDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
  const consumedAt = atLocalHour(historyDate, 11)

  return {
    user: {
      id: 'member-chen',
      openId: 'development-openid',
      name: '陈予安',
      phone: '138 0013 8000',
      roles: ['member', 'coach'],
    },
    role: 'member',
    coaches: [
      {
        id: 'coach-lin',
        userId: 'coach-user-lin',
        name: '林铮',
        bio: '力量与动作质量训练 · 8 年执教',
        phone: '139 1000 2001',
        status: 'active',
      },
      {
        id: 'coach-wang',
        userId: 'coach-user-wang',
        name: '王珂',
        bio: '体能与减脂训练 · NSCA-CPT',
        phone: '139 1000 2002',
        status: 'active',
      },
    ],
    products: [
      {
        id: 'product-strength-12',
        name: '力量私教 12 课时',
        priceCents: 468_000,
        lessonCount: 12,
        status: 'published',
        validDays: 90,
      },
      {
        id: 'product-foundation-8',
        name: '基础训练 8 课时',
        priceCents: 328_000,
        lessonCount: 8,
        status: 'published',
      },
    ],
    memberships: [
      {
        id: 'membership-seed',
        memberId: 'member-chen',
        coachId: 'coach-lin',
        productId: 'product-foundation-8',
        productName: '基础训练 8 课时',
        purchasePriceCents: 328_000,
        totalLessons: 8,
        availableLessons: 5,
        lockedLessons: 1,
        usedLessons: 2,
        purchasedAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    lessons: [
      {
        id: 'lesson-today',
        memberId: 'member-chen',
        coachId: 'coach-lin',
        membershipPackageId: 'membership-seed',
        startsAt: atLocalHour(now, 12),
        endsAt: atLocalHour(now, 13),
        status: 'booked',
      },
      {
        id: 'lesson-history',
        memberId: 'member-chen',
        coachId: 'coach-lin',
        membershipPackageId: 'membership-seed',
        startsAt: atLocalHour(historyDate, 10),
        endsAt: consumedAt,
        status: 'completed',
        completionSource: 'coach',
        consumedAt,
      },
    ],
    appeals: [],
    availability: {},
    requests: {},
  }
}

const isDevelopmentState = (value: unknown): value is DevelopmentState =>
  typeof value === 'object' && value !== null && 'user' in value && 'memberships' in value

export class DevelopmentStore {
  private state: DevelopmentState

  constructor(
    private readonly storage: StorageAdapter = new WechatStorage(),
    private readonly now: () => Date = () => new Date(),
  ) {
    const stored = this.storage.get()
    this.state = isDevelopmentState(stored) ? stored : createSeed(this.now())
    this.save()
  }

  read(): DevelopmentState {
    return this.clone(this.state)
  }

  update(change: (state: DevelopmentState) => void): DevelopmentState {
    const next = this.clone(this.state)
    change(next)
    this.state = next
    this.save()
    return this.read()
  }

  reset(): DevelopmentState {
    this.storage.clear()
    this.state = createSeed(this.now())
    this.save()
    return this.read()
  }

  private save(): void {
    this.storage.set(this.state)
  }

  private clone(state: DevelopmentState): DevelopmentState {
    return JSON.parse(JSON.stringify(state)) as DevelopmentState
  }
}
