import { autoCompleteDueLessons } from '../../../../server/gym/lessons'
import {
  createRuntimeStore,
  type EmasRuntimeContext,
  type StoreFactory,
} from '../../runtime'

interface AutoCompleteEntrypointOptions {
  storeFactory: StoreFactory
  nowProvider?: () => string
}

export const createAutoCompleteEntrypoint =
  (options: AutoCompleteEntrypointOptions) =>
  async (context: EmasRuntimeContext) => {
    const store = options.storeFactory(context)
    try {
      await store.load?.()
      const completedLessonIds = await autoCompleteDueLessons(
        store,
        options.nowProvider?.() ?? new Date().toISOString(),
      )
      return { ok: true as const, data: { completedLessonIds } }
    } catch {
      return {
        ok: false as const,
        error: { code: 'INTERNAL_ERROR', message: '操作失败，请稍后重试' },
      }
    }
  }

export const main = createAutoCompleteEntrypoint({
  storeFactory: createRuntimeStore,
})
