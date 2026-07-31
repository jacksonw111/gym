import type { Admin, Coach, Product } from '../../../../server/gym/store'
import {
  createRuntimeStore,
  type EmasRuntimeContext,
  type StoreFactory,
} from '../../runtime'

interface SeedInput {
  seedToken: string
  admin: Admin
  products: Product[]
  coaches: Coach[]
}

interface SeedEntrypointOptions {
  storeFactory: StoreFactory
  seedInput: SeedInput
}

const upsertById = <T extends { id: string }>(records: T[], incoming: T): void => {
  const existing = records.find((item) => item.id === incoming.id)
  if (existing) {
    Object.assign(existing, incoming)
  } else {
    records.push(incoming)
  }
}

export const createSeedEntrypoint =
  (options: SeedEntrypointOptions) =>
  async (context: EmasRuntimeContext) => {
    const args = context.args as { seedToken?: string }
    if (!options.seedInput.seedToken || args.seedToken !== options.seedInput.seedToken) {
      return {
        ok: false as const,
        error: { code: 'UNAUTHORIZED', message: '初始化口令无效' },
      }
    }

    const store = options.storeFactory(context)
    await store.load?.()
    await store.transaction(() => {
      upsertById(store.admins, options.seedInput.admin)
      for (const product of options.seedInput.products) upsertById(store.products, product)
      for (const coach of options.seedInput.coaches) upsertById(store.coaches, coach)
    })
    return {
      ok: true as const,
      data: {
        admins: 1,
        products: options.seedInput.products.length,
        coaches: options.seedInput.coaches.length,
      },
    }
  }

const loadSeedInput = (): SeedInput => require('./seed.json') as SeedInput

export const main = async (context: EmasRuntimeContext) =>
  createSeedEntrypoint({
    storeFactory: createRuntimeStore,
    seedInput: loadSeedInput(),
  })(context)
