import { init } from '@cloudbase/node-sdk'

interface InternalResponse {
  ok: boolean
  data?: { completedLessonIds: string[] }
  error?: { code: string; message: string }
}

export const main = async (): Promise<InternalResponse> => {
  const internalToken = process.env.INTERNAL_SCHEDULER_TOKEN
  if (!internalToken) {
    return {
      ok: false,
      error: { code: 'INTERNAL_CONFIG_ERROR', message: '内部定时任务密钥未配置' },
    }
  }
  const app = init({ env: process.env.TCB_ENV })
  const response = await app.callFunction({
    name: 'gym-api',
    data: {
      action: '__internalAutoCompleteLessons',
      requestId: `auto-complete-${Date.now()}`,
      payload: {},
      internalToken,
    },
  })
  return response.result as InternalResponse
}
