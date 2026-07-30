import { init } from '@cloudbase/node-sdk'
import { completeLesson } from '../../gym-api/src/lessons'
import type { Store } from '../../gym-api/src/store'
import { CloudBaseStore, type CloudDatabase } from '../../gym-api/src/store-cloudbase'

export const autoCompleteDueLessons = async (store: Store, now: string): Promise<string[]> => {
  const threshold = new Date(now).getTime() - 24 * 60 * 60 * 1000
  const dueIds = store.lessons
    .filter(
      (lesson) => lesson.status === 'booked' && new Date(lesson.endsAt).getTime() <= threshold,
    )
    .map((lesson) => lesson.id)

  const completed: string[] = []
  for (const lessonId of dueIds) {
    await completeLesson(store, {
      actor: { kind: 'system', id: 'auto-complete-lessons' },
      lessonId,
      now,
    })
    completed.push(lessonId)
  }
  return completed
}

export const main = async (): Promise<{ completedLessonIds: string[] }> => {
  const app = init({ env: process.env.TCB_ENV })
  const store = new CloudBaseStore(app.database() as unknown as CloudDatabase)
  await store.load()
  const completedLessonIds = await autoCompleteDueLessons(store, new Date().toISOString())
  return { completedLessonIds }
}
