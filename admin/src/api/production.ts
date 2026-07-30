import cloudbase from '@cloudbase/js-sdk'
import type {
  AdminApi,
  Appeal,
  Booking,
  Coach,
  CoachInput,
  CoachStatus,
  Member,
  Product,
  ProductInput,
  ProductStatus,
  Sale,
} from './types'

interface CloudResponse<T> {
  ok: boolean
  data?: T
  error?: { message: string }
}

const SESSION_KEY = 'purui-admin-session'

export const createProductionApi = (envId: string): AdminApi => {
  const app = cloudbase.init({ env: envId, timeout: 15_000, persistence: 'local' })

  const call = async <T>(action: string, payload: Record<string, unknown> = {}): Promise<T> => {
    const authToken = sessionStorage.getItem(SESSION_KEY)
    const response = await app.callFunction({
      name: 'gym-api',
      data: {
        action,
        requestId: crypto.randomUUID(),
        payload,
        ...(authToken ? { authToken } : {}),
      },
    })
    const result = response.result as CloudResponse<T>
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
      const [dashboard, coaches, members, products, bookings, appeals] = await Promise.all([
        call<{ sales: Sale[] }>('adminCrud', {
          resource: 'dashboard',
          operation: 'list',
        }),
        call<Coach[]>('adminCrud', { resource: 'coaches', operation: 'list' }),
        call<Member[]>('adminCrud', { resource: 'members', operation: 'list' }),
        call<Product[]>('adminCrud', { resource: 'packages', operation: 'list' }),
        call<Booking[]>('listBookings'),
        call<Appeal[]>('listAppeals'),
      ])
      return {
        coaches,
        members,
        products,
        bookings,
        appeals,
        sales: dashboard.sales,
      }
    },
    saveCoach: (input: CoachInput) =>
      call('adminCrud', { resource: 'coaches', operation: 'save', data: input }),
    setCoachStatus: (id: string, status: CoachStatus) =>
      call('adminCrud', {
        resource: 'coaches',
        operation: 'setStatus',
        data: { id, status },
      }),
    adjustPackage: (packageId, delta, note) => call('adjustBalance', { packageId, delta, note }),
    saveProduct: (input: ProductInput) =>
      call('adminCrud', { resource: 'packages', operation: 'save', data: input }),
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
