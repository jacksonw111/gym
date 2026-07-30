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

interface CloudDocument {
  get(): Promise<{ data: unknown }>
  set(input: { data: Record<string, unknown> }): Promise<unknown>
  remove(): Promise<unknown>
}

interface CloudCollection {
  get(): Promise<{ data: unknown }>
  doc(id: string): CloudDocument
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
      const record = structuredClone(item)
      if (typeof record.id !== 'string' && typeof record._id === 'string') record.id = record._id
      delete record._id
      return record
    })
}

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
        name: 'users',
        read: () => this.users,
        write: (records) => {
          this.users = records as User[]
        },
      },
      {
        name: 'coaches',
        read: () => this.coaches,
        write: (records) => {
          this.coaches = records as Coach[]
        },
      },
      {
        name: 'package_products',
        read: () => this.products,
        write: (records) => {
          this.products = records as Product[]
        },
      },
      {
        name: 'membership_packages',
        read: () => this.packages,
        write: (records) => {
          this.packages = records as MembershipPackage[]
        },
      },
      {
        name: 'orders',
        read: () => this.orders,
        write: (records) => {
          this.orders = records as Order[]
        },
      },
      {
        name: 'schedules',
        read: () => this.schedules,
        write: (records) => {
          this.schedules = records as ScheduleSlot[]
        },
      },
      {
        name: 'lessons',
        read: () => this.lessons,
        write: (records) => {
          this.lessons = records as Lesson[]
        },
      },
      {
        name: 'appeals',
        read: () => this.appeals,
        write: (records) => {
          this.appeals = records as Appeal[]
        },
      },
      {
        name: 'lesson_ledger',
        read: () => this.ledger,
        write: (records) => {
          this.ledger = records as LedgerEntry[]
        },
      },
      {
        name: 'admins',
        read: () => this.admins,
        write: (records) => {
          this.admins = records as Admin[]
        },
      },
      {
        name: 'admin_sessions',
        read: () => this.sessions,
        write: (records) => {
          this.sessions = records as AdminSession[]
        },
      },
    ]
  }

  private async loadFrom(database: CloudDatabase): Promise<void> {
    await Promise.all(
      this.definitions().map(async (definition) => {
        const result = await database.collection(definition.name).get()
        definition.write(recordsFromResult(result.data))
      }),
    )
  }

  async load(): Promise<void> {
    await this.loadFrom(this.database)
  }

  async transaction<T>(work: () => Promise<T> | T): Promise<T> {
    return this.database.runTransaction(async (transaction) => {
      const lock = transaction.collection('system_locks').doc('domain')
      const lockResult = await lock.get()
      const previousVersion =
        lockResult.data && typeof lockResult.data === 'object' && 'version' in lockResult.data
          ? Number(lockResult.data.version)
          : 0
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
            await collection.doc(id).set({
              data: structuredClone(record) as unknown as Record<string, unknown>,
            })
          }
        }
        for (const id of previous.keys()) {
          if (!current.has(id)) await collection.doc(id).remove()
        }
      }
      await lock.set({ data: { version: previousVersion + 1 } })
      return result
    })
  }

  nextId(prefix: string): string {
    return `${prefix}-${randomUUID()}`
  }
}
