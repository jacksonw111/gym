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

interface CloudDocument {
  get(): Promise<{ data: unknown }>
  set(data: Record<string, unknown>): Promise<unknown>
  remove(): Promise<unknown>
}

interface CloudCollection {
  get(): Promise<{ data: unknown }>
  doc(id: string): CloudDocument
  limit(pageSize: number): CloudCollection
  skip(offset: number): CloudCollection
}

export interface CloudDatabase {
  collection(name: string): CloudCollection
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
  systemLocks: 'system_locks',
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

  private async loadFrom(database: CloudDatabase): Promise<void> {
    for (const definition of this.definitions()) {
      const records: Array<Record<string, unknown>> = []
      let offset = 0
      while (true) {
        const result = await database
          .collection(definition.name)
          .limit(PAGE_SIZE)
          .skip(offset)
          .get()
        const page = recordsFromResult(result.data)
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
    try {
      return await this.database.runTransaction(async (transaction) => {
        const lock = transaction.collection(CLOUD_COLLECTIONS.systemLocks).doc('domain')
        const lockResult = await lock.get()
        const previousVersion =
          lockResult.data && typeof lockResult.data === 'object' && 'version' in lockResult.data
            ? Number(lockResult.data.version)
            : 0
        await this.loadFrom(transaction)
        const before = new Map(
          this.definitions().map((definition) => [
            definition.name,
            new Map(
              definition.read().map((record) => [record.id, JSON.stringify(record)] as const),
            ),
          ]),
        )

        const result = await work()
        for (const definition of this.definitions()) {
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
        await lock.set({ version: previousVersion + 1 })
        return result
      })
    } catch (error) {
      await this.load()
      throw error
    }
  }

  nextId(prefix: string): string {
    return `${prefix}-${randomUUID()}`
  }
}
