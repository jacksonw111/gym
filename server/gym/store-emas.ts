import { randomUUID } from 'node:crypto'
import type {
  Admin,
  AdminSession,
  Appeal,
  BookingLock,
  Coach,
  LedgerEntry,
  Lesson,
  MembershipPackage,
  Order,
  OperationRecord,
  Product,
  ScheduleSlot,
  Store,
  User,
} from './store'
import { cloneJson } from './store'

export interface EmasQueryResult {
  result: unknown
}

export interface EmasQuery {
  find(
    filter?: Record<string, unknown>,
    options?: { skip?: number; limit?: number },
  ): Promise<EmasQueryResult>
  replaceOne(
    filter: Record<string, unknown>,
    replacement: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<EmasQueryResult>
  deleteOne(filter: Record<string, unknown>): Promise<EmasQueryResult>
}

interface EmasCollectionProvider {
  collection(name: string): EmasQuery
}

export interface EmasTransaction extends EmasCollectionProvider {
  commit(): Promise<unknown>
  rollback(): Promise<unknown>
}

export interface EmasDatabase extends EmasCollectionProvider {
  startTransaction(): Promise<EmasTransaction>
}

interface CollectionDefinition {
  name: string
  read: () => Array<{ id: string }>
  write: (records: unknown[]) => void
}

const PAGE_SIZE = 100

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

export const EMAS_COLLECTIONS = {
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
  adminSessions: 'admin_sessions',
  bookingLocks: 'booking_locks',
  operations: 'operations',
} as const

export class EmasStore implements Store {
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
  bookingLocks: BookingLock[] = []
  operations: OperationRecord[] = []

  constructor(private readonly database: EmasDatabase) {}

  private definitions(): CollectionDefinition[] {
    return [
      {
        name: EMAS_COLLECTIONS.users,
        read: () => this.users,
        write: (records) => {
          this.users = records as User[]
        },
      },
      {
        name: EMAS_COLLECTIONS.coaches,
        read: () => this.coaches,
        write: (records) => {
          this.coaches = records as Coach[]
        },
      },
      {
        name: EMAS_COLLECTIONS.products,
        read: () => this.products,
        write: (records) => {
          this.products = records as Product[]
        },
      },
      {
        name: EMAS_COLLECTIONS.memberships,
        read: () => this.packages,
        write: (records) => {
          this.packages = records as MembershipPackage[]
        },
      },
      {
        name: EMAS_COLLECTIONS.orders,
        read: () => this.orders,
        write: (records) => {
          this.orders = records as Order[]
        },
      },
      {
        name: EMAS_COLLECTIONS.schedules,
        read: () => this.schedules,
        write: (records) => {
          this.schedules = records as ScheduleSlot[]
        },
      },
      {
        name: EMAS_COLLECTIONS.lessons,
        read: () => this.lessons,
        write: (records) => {
          this.lessons = records as Lesson[]
        },
      },
      {
        name: EMAS_COLLECTIONS.appeals,
        read: () => this.appeals,
        write: (records) => {
          this.appeals = records as Appeal[]
        },
      },
      {
        name: EMAS_COLLECTIONS.ledger,
        read: () => this.ledger,
        write: (records) => {
          this.ledger = records as LedgerEntry[]
        },
      },
      {
        name: EMAS_COLLECTIONS.admins,
        read: () => this.admins,
        write: (records) => {
          this.admins = records as Admin[]
        },
      },
      {
        name: EMAS_COLLECTIONS.adminSessions,
        read: () => this.sessions,
        write: (records) => {
          this.sessions = records as AdminSession[]
        },
      },
      {
        name: EMAS_COLLECTIONS.bookingLocks,
        read: () => this.bookingLocks,
        write: (records) => {
          this.bookingLocks = records as BookingLock[]
        },
      },
      {
        name: EMAS_COLLECTIONS.operations,
        read: () => this.operations,
        write: (records) => {
          this.operations = records as OperationRecord[]
        },
      },
    ]
  }

  private async loadFrom(provider: EmasCollectionProvider): Promise<void> {
    for (const definition of this.definitions()) {
      const records: Array<Record<string, unknown>> = []
      let offset = 0
      while (true) {
        const response = await provider.collection(definition.name).find(
          {},
          {
            skip: offset,
            limit: PAGE_SIZE,
          },
        )
        const page = recordsFromResult(response.result)
        records.push(...page)
        if (page.length < PAGE_SIZE) break
        offset += PAGE_SIZE
      }
      definition.write(records)
    }
  }

  async load(): Promise<void> {
    await this.loadFrom(this.database)
  }

  async transaction<T>(work: () => Promise<T> | T): Promise<T> {
    const transaction = await this.database.startTransaction()
    try {
      await this.loadFrom(transaction)
      const before = new Map(
        this.definitions().map((definition) => [
          definition.name,
          new Map(definition.read().map((record) => [record.id, JSON.stringify(record)] as const)),
        ]),
      )
      const result = await work()
      for (const definition of this.definitions()) {
        const collection = transaction.collection(definition.name)
        const previous = before.get(definition.name) ?? new Map<string, string>()
        const current = new Map(definition.read().map((record) => [record.id, record] as const))
        for (const [id, record] of current) {
          if (previous.get(id) !== JSON.stringify(record)) {
            await collection.replaceOne({ id }, cloneJson(record), { upsert: true })
          }
        }
        for (const id of previous.keys()) {
          if (!current.has(id)) await collection.deleteOne({ id })
        }
      }
      await transaction.commit()
      return result
    } catch (error) {
      await transaction.rollback()
      await this.load()
      throw error
    }
  }

  nextId(prefix: string): string {
    return `${prefix}-${randomUUID()}`
  }
}
