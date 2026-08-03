import { randomUUID } from 'node:crypto'
import type {
  Admin,
  AdminSession,
  Appeal,
  Coach,
  LedgerEntry,
  Lesson,
  MembershipPackage,
  Order,
  Product,
  ScheduleSlot,
  Store,
  User,
} from './store'
import { cloneJson } from './store'
import type { StoreRequest } from './store-scope'

interface CloudDocument {
  get(): Promise<{ data: unknown }>
  set(data: Record<string, unknown>): Promise<unknown>
  remove(): Promise<unknown>
}

interface CloudCollection {
  get(): Promise<{ data: unknown }>
  doc(id: string): CloudDocument
  where(filter: Record<string, unknown>): CloudCollection
  limit(pageSize: number): CloudCollection
  skip(offset: number): CloudCollection
}

export interface CloudDatabase {
  collection(name: string): CloudCollection
  command?: { in(values: unknown[]): unknown }
  runTransaction<T>(work: (transaction: CloudDatabase) => Promise<T>): Promise<T>
}

interface CollectionDefinition {
  name: string
  read: () => Array<{ id: string }>
  write: (records: unknown[]) => void
}

const recordsFromResult = (result: unknown): Array<Record<string, unknown>> => {
  if (!Array.isArray(result)) return []
  return result
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => {
      const record = cloneJson(item)
      if (typeof record.id !== 'string' && typeof record._id === 'string') record.id = record._id
      delete record._id
      return record
    })
}

const PAGE_SIZE = 100

export const CLOUD_COLLECTIONS = {
  users: 'users',
  coaches: 'coaches',
  products: 'products',
  memberships: 'memberships',
  orders: 'orders',
  schedules: 'schedules',
  lessons: 'lessons',
  appeals: 'appeals',
  ledger: 'ledger',
  admins: 'admins',
  adminSessions: 'adminSessions',
} as const

export class CloudBaseStore implements Store {
  users: User[] = []
  coaches: Coach[] = []
  products: Product[] = []
  packages: MembershipPackage[] = []
  orders: Order[] = []
  schedules: ScheduleSlot[] = []
  lessons: Lesson[] = []
  appeals: Appeal[] = []
  ledger: LedgerEntry[] = []
  admins: Admin[] = []
  sessions: AdminSession[] = []
  private preparedRequest?: StoreRequest
  private writableCollections = new Set<string>()

  constructor(private readonly database: CloudDatabase) {}

  private definitions(): CollectionDefinition[] {
    return [
      {
        name: CLOUD_COLLECTIONS.users,
        read: () => this.users,
        write: (records) => {
          this.users = records as User[]
        },
      },
      {
        name: CLOUD_COLLECTIONS.coaches,
        read: () => this.coaches,
        write: (records) => {
          this.coaches = records as Coach[]
        },
      },
      {
        name: CLOUD_COLLECTIONS.products,
        read: () => this.products,
        write: (records) => {
          this.products = records as Product[]
        },
      },
      {
        name: CLOUD_COLLECTIONS.memberships,
        read: () => this.packages,
        write: (records) => {
          this.packages = records as MembershipPackage[]
        },
      },
      {
        name: CLOUD_COLLECTIONS.orders,
        read: () => this.orders,
        write: (records) => {
          this.orders = records as Order[]
        },
      },
      {
        name: CLOUD_COLLECTIONS.schedules,
        read: () => this.schedules,
        write: (records) => {
          this.schedules = records as ScheduleSlot[]
        },
      },
      {
        name: CLOUD_COLLECTIONS.lessons,
        read: () => this.lessons,
        write: (records) => {
          this.lessons = records as Lesson[]
        },
      },
      {
        name: CLOUD_COLLECTIONS.appeals,
        read: () => this.appeals,
        write: (records) => {
          this.appeals = records as Appeal[]
        },
      },
      {
        name: CLOUD_COLLECTIONS.ledger,
        read: () => this.ledger,
        write: (records) => {
          this.ledger = records as LedgerEntry[]
        },
      },
      {
        name: CLOUD_COLLECTIONS.admins,
        read: () => this.admins,
        write: (records) => {
          this.admins = records as Admin[]
        },
      },
      {
        name: CLOUD_COLLECTIONS.adminSessions,
        read: () => this.sessions,
        write: (records) => {
          this.sessions = records as AdminSession[]
        },
      },
    ]
  }

  private async loadDefinition(
    database: CloudDatabase,
    definition: CollectionDefinition,
    where: Record<string, unknown>,
    merge = false,
  ): Promise<void> {
    const records: Array<Record<string, unknown>> = []
    const entries = Object.entries(where)
    if (entries.length === 1 && entries[0]?.[0] === 'id' && typeof entries[0][1] === 'string') {
      const result = await database.collection(definition.name).doc(entries[0][1]).get()
      records.push(...recordsFromResult(result.data ? [result.data] : []))
    } else {
      let offset = 0
      while (true) {
        const result = await database
          .collection(definition.name)
          .where(where)
          .limit(PAGE_SIZE)
          .skip(offset)
          .get()
        const page = recordsFromResult(result.data)
        records.push(...page)
        if (page.length < PAGE_SIZE) break
        offset += PAGE_SIZE
      }
    }
    if (definition.name === CLOUD_COLLECTIONS.products) {
      for (const record of records) {
        if (!['published', 'unpublished'].includes(String(record.status))) {
          record.status = 'unpublished'
        }
      }
    }
    if (merge) {
      const combined = new Map(definition.read().map((record) => [record.id, record]))
      for (const record of records) combined.set(String(record.id), record as { id: string })
      definition.write([...combined.values()])
    } else {
      definition.write(records)
    }
  }

  private async loadByValues(
    database: CloudDatabase,
    definition: CollectionDefinition,
    field: string,
    values: string[],
    merge = false,
  ): Promise<void> {
    const uniqueValues = [...new Set(values.filter(Boolean))]
    if (uniqueValues.length === 0) {
      if (!merge) definition.write([])
      return
    }
    const inCommand = this.database.command?.in(uniqueValues)
    if (inCommand) {
      await this.loadDefinition(database, definition, { [field]: inCommand }, merge)
      return
    }
    let shouldMerge = merge
    for (const value of uniqueValues) {
      await this.loadDefinition(database, definition, { [field]: value }, shouldMerge)
      shouldMerge = true
    }
  }

  private definition(name: string): CollectionDefinition {
    const definition = this.definitions().find((item) => item.name === name)
    if (!definition) throw new Error(`Unknown CloudBase collection: ${name}`)
    return definition
  }

  private markWritable(...names: string[]): void {
    for (const name of names) this.writableCollections.add(name)
  }

  private async loadCurrentUser(
    database: CloudDatabase,
    request: StoreRequest,
  ): Promise<User | undefined> {
    if (!request.identity?.openId) {
      this.users = []
      return undefined
    }
    await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.users), {
      openId: request.identity.openId,
    })
    return this.users[0]
  }

  private async loadAdminIdentity(
    database: CloudDatabase,
    request: StoreRequest,
  ): Promise<AdminSession | undefined> {
    if (!request.authToken) {
      this.sessions = []
      this.admins = []
      return undefined
    }
    await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.adminSessions), {
      token: request.authToken,
    })
    const session = this.sessions[0]
    if (session) {
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.admins), {
        id: session.adminId,
      })
    }
    return session
  }

  private async prepareFrom(database: CloudDatabase, request: StoreRequest): Promise<void> {
    for (const definition of this.definitions()) definition.write([])
    this.writableCollections.clear()
    if (request.action === 'listPackages') {
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.products), {
        status: 'published',
      })
      return
    }
    if (request.action === 'listCoaches') {
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.coaches), {
        status: 'active',
      })
      return
    }
    if (request.action === 'registerMember') {
      await this.loadCurrentUser(database, request)
      this.markWritable(CLOUD_COLLECTIONS.users)
      return
    }
    if (request.action === 'getSchedule') {
      const coachId = String(request.payload.coachId ?? '')
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.coaches), {
        id: coachId,
      })
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.schedules), {
        coachId,
      })
      await this.loadCurrentUser(database, request)
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.lessons), {
        coachId,
      })
      this.markWritable(CLOUD_COLLECTIONS.schedules)
      return
    }
    if (request.action === 'getCoachScheduleView') {
      const coachId = String(request.payload.coachId ?? '')
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.coaches), {
        id: coachId,
      })
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.schedules), {
        coachId,
      })
      const currentUser = await this.loadCurrentUser(database, request)
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.lessons), {
        coachId,
      })
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.memberships), {
        memberId: currentUser?.id,
      })
      if (this.coaches[0]?.userId === currentUser?.id) {
        await this.loadByValues(
          database,
          this.definition(CLOUD_COLLECTIONS.users),
          'id',
          this.lessons.map((lesson) => lesson.memberId),
          true,
        )
        await this.loadByValues(
          database,
          this.definition(CLOUD_COLLECTIONS.appeals),
          'lessonId',
          this.lessons.map((lesson) => lesson.id),
        )
      } else {
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.appeals), {
          memberId: currentUser?.id,
        })
      }
      this.markWritable(CLOUD_COLLECTIONS.schedules)
      return
    }
    if (request.action === 'getOwnCoachScheduleView') {
      const currentUser = await this.loadCurrentUser(database, request)
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.coaches), {
        userId: currentUser?.id,
      })
      const coachId = this.coaches[0]?.id
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.schedules), {
        coachId,
      })
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.lessons), {
        coachId,
      })
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.memberships), {
        memberId: currentUser?.id,
      })
      await this.loadByValues(
        database,
        this.definition(CLOUD_COLLECTIONS.appeals),
        'lessonId',
        this.lessons.map((lesson) => lesson.id),
      )
      await this.loadByValues(
        database,
        this.definition(CLOUD_COLLECTIONS.users),
        'id',
        this.lessons.map((lesson) => lesson.memberId),
        true,
      )
      this.markWritable(CLOUD_COLLECTIONS.schedules)
      return
    }
    if (request.action === 'purchase') {
      const member = await this.loadCurrentUser(database, request)
      const productId = String(request.payload.productId ?? '')
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.products), {
        id: productId,
      })
      const coachId = this.products[0]?.coachId ?? String(request.payload.coachId ?? '')
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.coaches), {
        id: coachId,
      })
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.orders), {
        memberId: member?.id,
        requestId: request.requestId,
      })
      this.markWritable(CLOUD_COLLECTIONS.orders)
      return
    }
    if (request.action === 'createDevPayment') {
      await this.loadCurrentUser(database, request)
      const orderId = String(request.payload.orderId ?? '')
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.orders), {
        id: orderId,
      })
      const order = this.orders[0]
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.memberships), {
        id: order?.packageId ?? '__missing__',
      })
      await this.loadDefinition(
        database,
        this.definition(CLOUD_COLLECTIONS.orders),
        { paymentId: `dev-${orderId}` },
        true,
      )
      this.markWritable(
        CLOUD_COLLECTIONS.orders,
        CLOUD_COLLECTIONS.memberships,
        CLOUD_COLLECTIONS.ledger,
      )
      return
    }
    if (request.action === 'bootstrap') {
      const currentUser = await this.loadCurrentUser(database, request)
      const view = request.payload.view
      if (view === 'session') {
        if (
          currentUser &&
          (request.payload.activeRole === 'coach' || currentUser.roles[0] === 'coach')
        ) {
          await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.coaches), {
            userId: currentUser.id,
          })
        }
        return
      }
      if (view === 'purchase') {
        if (!currentUser) return
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.orders), {
          id: request.payload.orderId,
        })
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.memberships), {
          id: this.orders[0]?.packageId ?? '__missing__',
        })
        return
      }
      if (view === 'lessonDetail') {
        if (!currentUser) return
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.lessons), {
          id: request.payload.lessonId,
        })
        const lesson = this.lessons[0]
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.coaches), {
          id: lesson?.coachId,
        })
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.memberships), {
          id: lesson?.membershipPackageId,
        })
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.appeals), {
          lessonId: lesson?.id,
        })
        return
      }
      if (view === 'coachDashboard') {
        if (!currentUser) return
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.coaches), {
          userId: currentUser?.id,
        })
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.lessons), {
          coachId: this.coaches[0]?.id,
        })
        await this.loadByValues(
          database,
          this.definition(CLOUD_COLLECTIONS.memberships),
          'id',
          this.lessons.map((lesson) => lesson.membershipPackageId),
        )
        await this.loadByValues(
          database,
          this.definition(CLOUD_COLLECTIONS.appeals),
          'lessonId',
          this.lessons.map((lesson) => lesson.id),
        )
        await this.loadByValues(
          database,
          this.definition(CLOUD_COLLECTIONS.users),
          'id',
          this.lessons.map((lesson) => lesson.memberId),
          true,
        )
        return
      }
      if (view === 'memberHome') {
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.products), {
          status: 'published',
        })
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.coaches), {
          status: 'active',
        })
        if (!currentUser) return
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.memberships), {
          memberId: currentUser?.id,
        })
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.lessons), {
          memberId: currentUser?.id,
          status: 'booked',
        })
        return
      }
      if (view === 'memberLessons') {
        if (!currentUser) return
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.coaches), {
          status: 'active',
        })
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.memberships), {
          memberId: currentUser?.id,
        })
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.lessons), {
          memberId: currentUser?.id,
        })
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.appeals), {
          memberId: currentUser?.id,
        })
        return
      }
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.products), {
        status: 'published',
      })
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.coaches), {
        status: 'active',
      })
      if (!currentUser) return
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.memberships), {
        memberId: currentUser.id,
      })
      const requestedRole = request.payload.activeRole
      const coach =
        requestedRole === 'coach' ||
        (requestedRole !== 'member' && currentUser.roles[0] === 'coach')
          ? this.coaches.find((item) => item.userId === currentUser.id)
          : undefined
      await this.loadDefinition(
        database,
        this.definition(CLOUD_COLLECTIONS.lessons),
        coach ? { coachId: coach.id } : { memberId: currentUser.id },
      )
      if (coach) {
        await this.loadByValues(
          database,
          this.definition(CLOUD_COLLECTIONS.appeals),
          'lessonId',
          this.lessons.map((lesson) => lesson.id),
        )
        await this.loadByValues(
          database,
          this.definition(CLOUD_COLLECTIONS.users),
          'id',
          this.lessons.map((lesson) => lesson.memberId),
          true,
        )
      } else {
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.appeals), {
          memberId: currentUser.id,
        })
      }
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.orders), {
        memberId: currentUser.id,
      })
      if (coach) {
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.schedules), {
          coachId: coach.id,
        })
      }
      return
    }
    if (request.action === 'bookLesson') {
      const coachId = String(request.payload.coachId ?? '')
      const packageId = String(request.payload.packageId ?? '')
      const startsAt = String(request.payload.startsAt ?? '')
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.users), {
        openId: request.identity?.openId,
      })
      const memberId = this.users[0]?.id
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.coaches), {
        id: coachId,
      })
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.memberships), {
        id: packageId,
      })
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.schedules), {
        coachId,
        startsAt,
      })
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.lessons), {
        memberId,
        requestId: request.requestId,
      })
      await this.loadDefinition(
        database,
        this.definition(CLOUD_COLLECTIONS.lessons),
        { coachId, startsAt, status: 'booked' },
        true,
      )
      for (const name of [
        CLOUD_COLLECTIONS.memberships,
        CLOUD_COLLECTIONS.schedules,
        CLOUD_COLLECTIONS.lessons,
        CLOUD_COLLECTIONS.ledger,
      ]) {
        this.writableCollections.add(name)
      }
      return
    }
    if (request.action === 'cancelLesson') {
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.users), {
        openId: request.identity?.openId,
      })
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.lessons), {
        id: request.payload.lessonId,
      })
      const lesson = this.lessons[0]
      if (lesson) {
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.memberships), {
          id: lesson.membershipPackageId,
        })
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.schedules), {
          coachId: lesson.coachId,
          startsAt: lesson.startsAt,
        })
      }
      for (const name of [
        CLOUD_COLLECTIONS.memberships,
        CLOUD_COLLECTIONS.schedules,
        CLOUD_COLLECTIONS.lessons,
        CLOUD_COLLECTIONS.ledger,
      ]) {
        this.writableCollections.add(name)
      }
      return
    }
    if (request.action === 'completeLesson') {
      const currentUser = await this.loadCurrentUser(database, request)
      if (currentUser?.roles.includes('coach')) {
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.coaches), {
          userId: currentUser.id,
        })
      }
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.lessons), {
        id: request.payload.lessonId,
      })
      const lesson = this.lessons[0]
      if (lesson) {
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.memberships), {
          id: lesson.membershipPackageId,
        })
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.schedules), {
          coachId: lesson.coachId,
          startsAt: lesson.startsAt,
        })
      }
      this.markWritable(
        CLOUD_COLLECTIONS.lessons,
        CLOUD_COLLECTIONS.memberships,
        CLOUD_COLLECTIONS.schedules,
        CLOUD_COLLECTIONS.ledger,
      )
      return
    }
    if (request.action === 'saveFeedback') {
      await this.loadCurrentUser(database, request)
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.lessons), {
        id: request.payload.lessonId,
      })
      this.markWritable(CLOUD_COLLECTIONS.lessons)
      return
    }
    if (request.action === 'createAppeal') {
      await this.loadCurrentUser(database, request)
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.lessons), {
        id: request.payload.lessonId,
      })
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.appeals), {
        lessonId: request.payload.lessonId,
      })
      this.markWritable(CLOUD_COLLECTIONS.appeals)
      return
    }
    if (request.action === 'setSchedule') {
      const user = await this.loadCurrentUser(database, request)
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.coaches), {
        userId: user?.id,
      })
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.schedules), {
        coachId: this.coaches[0]?.id,
      })
      this.markWritable(CLOUD_COLLECTIONS.schedules)
      return
    }
    if (request.action === 'coachCancel') {
      const user = await this.loadCurrentUser(database, request)
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.coaches), {
        userId: user?.id,
      })
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.lessons), {
        id: request.payload.lessonId,
      })
      const lesson = this.lessons[0]
      if (lesson) {
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.memberships), {
          id: lesson.membershipPackageId,
        })
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.schedules), {
          coachId: lesson.coachId,
          startsAt: lesson.startsAt,
        })
      }
      this.markWritable(
        CLOUD_COLLECTIONS.lessons,
        CLOUD_COLLECTIONS.memberships,
        CLOUD_COLLECTIONS.schedules,
        CLOUD_COLLECTIONS.ledger,
      )
      return
    }
    if (request.action === 'adminLogin') {
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.admins), {
        username: request.payload.username,
      })
      this.markWritable(CLOUD_COLLECTIONS.adminSessions)
      return
    }
    if (request.action === 'grantPaidOrder') {
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.orders), {
        id: request.payload.orderId,
      })
      await this.loadDefinition(
        database,
        this.definition(CLOUD_COLLECTIONS.orders),
        { paymentId: request.payload.paymentId },
        true,
      )
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.memberships), {
        id:
          this.orders.find((item) => item.id === request.payload.orderId)?.packageId ??
          '__missing__',
      })
      this.markWritable(
        CLOUD_COLLECTIONS.orders,
        CLOUD_COLLECTIONS.memberships,
        CLOUD_COLLECTIONS.ledger,
      )
      return
    }
    if (request.action === '__internalAutoCompleteLessons') {
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.lessons), {
        status: 'booked',
      })
      await this.loadByValues(
        database,
        this.definition(CLOUD_COLLECTIONS.memberships),
        'id',
        this.lessons.map((lesson) => lesson.membershipPackageId),
      )
      await this.loadByValues(
        database,
        this.definition(CLOUD_COLLECTIONS.schedules),
        'occupiedLessonId',
        this.lessons.map((lesson) => lesson.id),
      )
      this.markWritable(
        CLOUD_COLLECTIONS.lessons,
        CLOUD_COLLECTIONS.memberships,
        CLOUD_COLLECTIONS.schedules,
        CLOUD_COLLECTIONS.ledger,
      )
      return
    }
    if (request.action === 'adminPage') {
      await this.loadAdminIdentity(database, request)
      if (request.payload.page === 'products') {
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.products), {})
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.coaches), {})
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.orders), {
          status: 'paid',
        })
        return
      }
      const pageCollections: Record<string, string[]> = {
        dashboard: [
          CLOUD_COLLECTIONS.lessons,
          CLOUD_COLLECTIONS.appeals,
          CLOUD_COLLECTIONS.orders,
          CLOUD_COLLECTIONS.users,
          CLOUD_COLLECTIONS.coaches,
          CLOUD_COLLECTIONS.memberships,
          CLOUD_COLLECTIONS.ledger,
        ],
        coaches: [
          CLOUD_COLLECTIONS.coaches,
          CLOUD_COLLECTIONS.users,
          CLOUD_COLLECTIONS.memberships,
          CLOUD_COLLECTIONS.lessons,
          CLOUD_COLLECTIONS.schedules,
        ],
        members: [
          CLOUD_COLLECTIONS.users,
          CLOUD_COLLECTIONS.coaches,
          CLOUD_COLLECTIONS.memberships,
          CLOUD_COLLECTIONS.lessons,
          CLOUD_COLLECTIONS.orders,
          CLOUD_COLLECTIONS.ledger,
          CLOUD_COLLECTIONS.appeals,
        ],
        bookings: [
          CLOUD_COLLECTIONS.lessons,
          CLOUD_COLLECTIONS.users,
          CLOUD_COLLECTIONS.coaches,
          CLOUD_COLLECTIONS.memberships,
          CLOUD_COLLECTIONS.ledger,
          CLOUD_COLLECTIONS.appeals,
        ],
        appeals: [
          CLOUD_COLLECTIONS.appeals,
          CLOUD_COLLECTIONS.lessons,
          CLOUD_COLLECTIONS.users,
          CLOUD_COLLECTIONS.coaches,
          CLOUD_COLLECTIONS.memberships,
          CLOUD_COLLECTIONS.ledger,
        ],
      }
      const collections = pageCollections[String(request.payload.page)]
      if (!collections) return
      for (const name of collections) {
        await this.loadDefinition(database, this.definition(name), {})
      }
      return
    }
    if (request.action === 'adminCrud') {
      await this.loadAdminIdentity(database, request)
      const resource = request.payload.resource
      const operation = request.payload.operation
      const data =
        request.payload.data && typeof request.payload.data === 'object'
          ? (request.payload.data as Record<string, unknown>)
          : {}
      if (resource === 'packages' && ['get', 'save', 'setStatus'].includes(String(operation))) {
        const id = typeof data.id === 'string' ? data.id : undefined
        await this.loadDefinition(
          database,
          this.definition(CLOUD_COLLECTIONS.products),
          id ? { id } : {},
        )
        this.writableCollections.add(CLOUD_COLLECTIONS.products)
        if (operation === 'save' && typeof data.coachId === 'string') {
          await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.coaches), {
            id: data.coachId,
          })
        }
        return
      }
      if (resource === 'packages' && operation === 'list') {
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.products), {})
        return
      }
      if (resource === 'coaches') {
        const id = typeof data.id === 'string' ? data.id : undefined
        await this.loadDefinition(
          database,
          this.definition(CLOUD_COLLECTIONS.coaches),
          id ? { id } : {},
        )
        if (operation === 'save' && typeof data.userId === 'string') {
          await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.users), {
            id: data.userId,
          })
          await this.loadDefinition(
            database,
            this.definition(CLOUD_COLLECTIONS.coaches),
            { userId: data.userId },
            true,
          )
          this.markWritable(CLOUD_COLLECTIONS.users)
        }
        if (operation !== 'list' && operation !== 'get') {
          this.markWritable(CLOUD_COLLECTIONS.coaches)
        }
        return
      }
      if (resource === 'members') {
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.users), {})
        return
      }
      return
    }
    if (request.action === 'listBookings') {
      if (request.authToken) {
        await this.loadAdminIdentity(database, request)
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.lessons), {})
      } else {
        const user = await this.loadCurrentUser(database, request)
        await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.coaches), {
          userId: user?.id,
        })
        await this.loadDefinition(
          database,
          this.definition(CLOUD_COLLECTIONS.lessons),
          this.coaches[0] ? { coachId: this.coaches[0].id } : { memberId: user?.id },
        )
      }
      return
    }
    if (request.action === 'listAppeals') {
      await this.loadAdminIdentity(database, request)
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.appeals), {})
      return
    }
    if (request.action === 'decideAppeal') {
      await this.loadAdminIdentity(database, request)
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.appeals), {
        id: request.payload.appealId,
      })
      const appeal = this.appeals[0]
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.lessons), {
        id: appeal?.lessonId,
      })
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.memberships), {
        id: this.lessons[0]?.membershipPackageId,
      })
      this.markWritable(
        CLOUD_COLLECTIONS.appeals,
        CLOUD_COLLECTIONS.memberships,
        CLOUD_COLLECTIONS.ledger,
      )
      return
    }
    if (request.action === 'adjustBalance') {
      await this.loadAdminIdentity(database, request)
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.memberships), {
        id: request.payload.packageId,
      })
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.ledger), {
        packageId: request.payload.packageId,
      })
      this.markWritable(CLOUD_COLLECTIONS.memberships, CLOUD_COLLECTIONS.ledger)
      return
    }
    if (request.action === 'coachLeave') {
      await this.loadAdminIdentity(database, request)
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.coaches), {
        id: request.payload.coachId,
      })
      if (request.payload.transferCoachId) {
        await this.loadDefinition(
          database,
          this.definition(CLOUD_COLLECTIONS.coaches),
          { id: request.payload.transferCoachId },
          true,
        )
      }
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.memberships), {
        coachId: request.payload.coachId,
      })
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.lessons), {
        coachId: request.payload.coachId,
      })
      await this.loadDefinition(database, this.definition(CLOUD_COLLECTIONS.products), {
        coachId: request.payload.coachId,
      })
      this.markWritable(
        CLOUD_COLLECTIONS.coaches,
        CLOUD_COLLECTIONS.memberships,
        CLOUD_COLLECTIONS.lessons,
        CLOUD_COLLECTIONS.products,
      )
      return
    }
  }

  async prepare(request: StoreRequest): Promise<void> {
    this.preparedRequest = cloneJson(request)
    await this.prepareFrom(this.database, request)
  }

  async transaction<T>(work: () => Promise<T> | T): Promise<T> {
    const localBefore = new Map(
      this.definitions().map((definition) => [definition.name, cloneJson(definition.read())]),
    )
    try {
      return await this.database.runTransaction(async (transaction) => {
        if (!this.preparedRequest) throw new Error('CloudBaseStore request is not prepared')
        await this.prepareFrom(transaction, this.preparedRequest)
        const writableDefinitions = this.definitions().filter((definition) =>
          this.writableCollections.has(definition.name),
        )
        const before = new Map(
          writableDefinitions.map((definition) => [
            definition.name,
            new Map(
              definition.read().map((record) => [record.id, JSON.stringify(record)] as const),
            ),
          ]),
        )

        const result = await work()
        for (const definition of writableDefinitions) {
          const collection = transaction.collection(definition.name)
          const previous = before.get(definition.name) ?? new Map<string, string>()
          const current = new Map(definition.read().map((record) => [record.id, record] as const))
          for (const [id, record] of current) {
            if (previous.get(id) !== JSON.stringify(record)) {
              await collection.doc(id).set(cloneJson(record) as unknown as Record<string, unknown>)
            }
          }
          for (const id of previous.keys()) {
            if (!current.has(id)) await collection.doc(id).remove()
          }
        }
        return result
      })
    } catch (error) {
      for (const definition of this.definitions()) {
        definition.write(cloneJson(localBefore.get(definition.name) ?? []))
      }
      throw error
    }
  }

  nextId(prefix: string): string {
    return `${prefix}-${randomUUID()}`
  }
}
