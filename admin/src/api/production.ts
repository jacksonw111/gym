import { normalizeAdminData, toCloudProductInput } from './normalize'
import type { AdminApi, CoachInput, CoachStatus, ProductInput, ProductStatus } from './types'

interface CloudResponse<T> {
  ok: boolean
  data?: T
  error?: { message: string }
}

const SESSION_KEY = 'purui-admin-session'

export const createProductionApi = (envId: string): AdminApi => {
  const endpoint = `https://${envId}.service.tcloudbase.com/gym-admin-api`

  const call = async <T>(action: string, payload: Record<string, unknown> = {}): Promise<T> => {
    const authToken = sessionStorage.getItem(SESSION_KEY)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        requestId: crypto.randomUUID(),
        payload,
        ...(authToken ? { authToken } : {}),
      }),
    })
    if (!response.ok) throw new Error('后台服务暂时不可用')
    const result = (await response.json()) as CloudResponse<T>
    if (!result.ok) throw new Error(result.error?.message ?? '后台请求失败')
    return result.data as T
  }

  return {
    getSession: () => Boolean(sessionStorage.getItem(SESSION_KEY)),
    async login(username, password) {
      const result = await call<{ token: string }>('adminLogin', { username, password })
      sessionStorage.setItem(SESSION_KEY, result.token)
    },
    async logout() {
      sessionStorage.removeItem(SESSION_KEY)
    },
    async loadData() {
      const [dashboard, bookings, appeals] = await Promise.all([
        call<unknown>('adminCrud', {
          resource: 'dashboard',
          operation: 'list',
        }),
        call<unknown>('listBookings'),
        call<unknown>('listAppeals'),
      ])
      return normalizeAdminData(dashboard, bookings, appeals)
    },
    saveCoach: (input: CoachInput) =>
      call<{ id: string }>('adminCrud', {
        resource: 'coaches',
        operation: 'save',
        data: input,
      }),
    setCoachStatus: (id: string, status: CoachStatus) =>
      call('adminCrud', {
        resource: 'coaches',
        operation: 'setStatus',
        data: { id, status },
      }),
    adjustPackage: (packageId, delta, note) => call('adjustBalance', { packageId, delta, note }),
    saveProduct: (input: ProductInput) =>
      call('adminCrud', {
        resource: 'packages',
        operation: 'save',
        data: toCloudProductInput(input),
      }),
    setProductStatus: (id: string, status: ProductStatus) =>
      call('adminCrud', {
        resource: 'packages',
        operation: 'setStatus',
        data: { id, status },
      }),
    decideAppeal: (id, decision, decisionNote) =>
      call('decideAppeal', { appealId: id, decision, decisionNote }),
  }
}
