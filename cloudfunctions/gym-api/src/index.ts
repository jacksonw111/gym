import { randomUUID } from 'node:crypto'
import { init } from '@cloudbase/node-sdk'
import { createAppeal, decideAppeal } from './appeals'
import type { Actor } from './auth'
import {
  bookLesson,
  cancelLessonByCoach,
  cancelLessonByMember,
  completeLesson,
  saveFeedback,
} from './lessons'
import { adjustBalance, createOrder } from './packages'
import { createDevPayment, createWechatPaymentProvider, type PaymentEnvironment } from './payment'
import { hashAdminPassword } from './seed'
import type { Admin, Coach, Product, ScheduleSlot, Store, User } from './store'
import { CloudBaseStore, type CloudDatabase } from './store-cloudbase'

export interface ApiRequest {
  action: string
  requestId: string
  payload: unknown
  identity?: { openId: string }
  authToken?: string
}

export type ApiResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string } }

class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

type ObjectPayload = Record<string, unknown>

const asObject = (payload: unknown): ObjectPayload => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ApiError('INVALID_REQUEST', '请求内容格式不正确')
  }
  return payload as ObjectPayload
}

const requiredString = (payload: ObjectPayload, key: string): string => {
  const value = payload[key]
  if (typeof value !== 'string' || !value) {
    throw new ApiError('INVALID_REQUEST', `缺少参数：${key}`)
  }
  return value
}

const getCurrentUser = (store: Store, request: ApiRequest): User => {
  const openId = request.identity?.openId
  const user = openId ? store.users.find((item) => item.openId === openId) : undefined
  if (!user) throw new ApiError('UNAUTHORIZED', '请先登录')
  return user
}

const getCurrentCoach = (store: Store, request: ApiRequest): Coach => {
  const user = getCurrentUser(store, request)
  const coach = store.coaches.find((item) => item.userId === user.id)
  if (!coach) throw new ApiError('UNAUTHORIZED', '当前账号不是教练')
  return coach
}

const requireAdmin = (store: Store, request: ApiRequest, now: string): Admin => {
  const session = store.sessions.find(
    (item) => item.token === request.authToken && new Date(item.expiresAt) > new Date(now),
  )
  const admin = session ? store.admins.find((item) => item.id === session.adminId) : undefined
  if (!admin) throw new ApiError('UNAUTHORIZED', '管理员会话无效或已过期')
  return admin
}

const getActorForLesson = (store: Store, request: ApiRequest, lessonId: string): Actor => {
  const user = getCurrentUser(store, request)
  const lesson = store.lessons.find((item) => item.id === lessonId)
  if (lesson?.memberId === user.id && user.roles.includes('member')) {
    return { kind: 'member', id: user.id }
  }
  const coach = store.coaches.find((item) => item.userId === user.id)
  if (coach && lesson?.coachId === coach.id && user.roles.includes('coach')) {
    return { kind: 'coach', id: coach.id }
  }
  throw new ApiError('UNAUTHORIZED', '没有权限操作该课程')
}

const adminDashboard = (store: Store) => ({
  coaches: store.coaches,
  members: store.users.filter((item) => item.roles.includes('member')),
  packages: store.products,
  memberships: store.packages,
  bookings: store.lessons,
  appeals: store.appeals,
  orders: store.orders,
})

const mutateAdminResource = (
  store: Store,
  resource: 'coaches' | 'members' | 'packages',
  operation: string,
  data: unknown,
): unknown => {
  const value = data && typeof data === 'object' ? (data as ObjectPayload) : {}
  const collections = {
    coaches: store.coaches,
    members: store.users,
    packages: store.products,
  }
  const collection = collections[resource] as Array<User | Coach | Product>
  if (operation === 'list') return collection
  const id =
    typeof value.id === 'string' && value.id
      ? value.id
      : operation === 'save'
        ? store.nextId(resource.slice(0, -1))
        : requiredString(value, 'id')
  const existingIndex = collection.findIndex((item) => item.id === id)
  if (operation === 'get') {
    const existing = collection[existingIndex]
    if (!existing) throw new Error('记录不存在')
    return existing
  }
  if (operation === 'save') {
    const record = { ...structuredClone(value), id } as unknown as User | Coach | Product
    if (existingIndex < 0) collection.push(record)
    else {
      collection[existingIndex] = { ...collection[existingIndex], ...record } as
        | User
        | Coach
        | Product
    }
    return existingIndex < 0 ? record : collection[existingIndex]
  }
  if (operation === 'setStatus') {
    const existing = collection[existingIndex]
    if (!existing) throw new Error('记录不存在')
    if (!('status' in existing)) throw new Error('该资源不支持状态变更')
    const status = requiredString(value, 'status')
    if (
      (resource === 'coaches' && !['active', 'inactive'].includes(status)) ||
      (resource === 'packages' && !['published', 'unpublished'].includes(status))
    ) {
      throw new Error('状态值不合法')
    }
    Object.assign(existing, { status })
    return existing
  }
  throw new ApiError('INVALID_REQUEST', '不支持的管理操作')
}

const handleAdminCrud = (store: Store, payload: ObjectPayload): unknown => {
  const resource = requiredString(payload, 'resource')
  const operation = requiredString(payload, 'operation')
  if (resource === 'dashboard') {
    if (operation !== 'list') throw new ApiError('INVALID_REQUEST', '总览只支持列表操作')
    return adminDashboard(store)
  }
  if (!['coaches', 'members', 'packages'].includes(resource)) {
    throw new ApiError('INVALID_REQUEST', '不支持的管理资源')
  }
  return mutateAdminResource(
    store,
    resource as 'coaches' | 'members' | 'packages',
    operation,
    payload.data,
  )
}

export const createRouter = (
  store: Store,
  environment: PaymentEnvironment,
  nowProvider: () => string = () => new Date().toISOString(),
) => {
  return async (request: ApiRequest): Promise<ApiResponse> => {
    try {
      const payload = asObject(request.payload)
      const now = nowProvider()
      switch (request.action) {
        case 'bootstrap': {
          const currentUser = getCurrentUser(store, request)
          const requestedRole = payload.activeRole
          const activeRole =
            (requestedRole === 'member' || requestedRole === 'coach') &&
            currentUser.roles.includes(requestedRole)
              ? requestedRole
              : currentUser.roles[0]
          if (!activeRole) throw new ApiError('UNAUTHORIZED', '当前账号没有可用角色')
          const coach =
            activeRole === 'coach'
              ? store.coaches.find((item) => item.userId === currentUser.id)
              : undefined
          if (activeRole === 'coach' && !coach) {
            throw new ApiError('UNAUTHORIZED', '教练资料不存在')
          }
          const actor = {
            kind: activeRole,
            id: activeRole === 'coach' ? (coach as Coach).id : currentUser.id,
          }
          return {
            ok: true,
            data: {
              actor,
              profile: currentUser,
              roles: currentUser.roles,
              activeRole,
              packages: store.products.filter((item) => item.status === 'published'),
              coaches: store.coaches.filter((item) => item.status === 'active'),
              memberships: store.packages.filter((item) => item.memberId === currentUser.id),
              lessons: store.lessons.filter((item) =>
                coach ? item.coachId === coach.id : item.memberId === currentUser.id,
              ),
              appeals: store.appeals.filter((item) =>
                coach
                  ? store.lessons.some(
                      (lesson) => lesson.id === item.lessonId && lesson.coachId === coach.id,
                    )
                  : item.memberId === currentUser.id,
              ),
              coach: {
                schedule: coach ? store.schedules.filter((item) => item.coachId === coach.id) : [],
                lessons: coach ? store.lessons.filter((item) => item.coachId === coach.id) : [],
              },
            },
          }
        }
        case 'listPackages':
          return { ok: true, data: store.products.filter((item) => item.status === 'published') }
        case 'listCoaches':
          return { ok: true, data: store.coaches.filter((item) => item.status === 'active') }
        case 'getSchedule':
          return {
            ok: true,
            data: store.schedules.filter(
              (item) =>
                item.coachId === requiredString(payload, 'coachId') &&
                (payload.includeClosed === true || item.open),
            ),
          }
        case 'purchase': {
          const member = getCurrentUser(store, request)
          const order = await createOrder(store, {
            memberId: member.id,
            coachId: requiredString(payload, 'coachId'),
            productId: requiredString(payload, 'productId'),
            createdAt: now,
          })
          if (!environment.createPaymentParameters) {
            throw new Error('微信支付服务尚未配置')
          }
          const paymentOrder = await environment.createPaymentParameters(order)
          if (paymentOrder.orderId !== order.id) throw new Error('支付订单校验失败')
          return {
            ok: true,
            data: { order, payment: paymentOrder.payment },
          }
        }
        case 'createDevPayment': {
          const member = getCurrentUser(store, request)
          const orderId = requiredString(payload, 'orderId')
          const order = store.orders.find((item) => item.id === orderId)
          if (order?.memberId !== member.id) throw new ApiError('UNAUTHORIZED', '不能支付他人订单')
          return {
            ok: true,
            data: await createDevPayment(store, environment, { orderId, now }),
          }
        }
        case 'bookLesson': {
          const member = getCurrentUser(store, request)
          return {
            ok: true,
            data: await bookLesson(store, {
              memberId: member.id,
              coachId: requiredString(payload, 'coachId'),
              packageId: requiredString(payload, 'packageId'),
              startsAt: requiredString(payload, 'startsAt'),
              requestId: request.requestId,
              now,
            }),
          }
        }
        case 'cancelLesson': {
          const member = getCurrentUser(store, request)
          return {
            ok: true,
            data: await cancelLessonByMember(
              store,
              member.id,
              requiredString(payload, 'lessonId'),
              now,
            ),
          }
        }
        case 'completeLesson': {
          const lessonId = requiredString(payload, 'lessonId')
          return {
            ok: true,
            data: await completeLesson(store, {
              actor: getActorForLesson(store, request, lessonId),
              lessonId,
              now,
            }),
          }
        }
        case 'saveFeedback': {
          const member = getCurrentUser(store, request)
          return {
            ok: true,
            data: await saveFeedback(
              store,
              member.id,
              requiredString(payload, 'lessonId'),
              {
                rating: payload.rating as 1 | 2 | 3 | 4 | 5 | undefined,
                comment: typeof payload.comment === 'string' ? payload.comment : undefined,
              },
              now,
            ),
          }
        }
        case 'createAppeal': {
          const member = getCurrentUser(store, request)
          return {
            ok: true,
            data: await createAppeal(store, {
              memberId: member.id,
              lessonId: requiredString(payload, 'lessonId'),
              reason: requiredString(payload, 'reason'),
              note: typeof payload.note === 'string' ? payload.note : undefined,
              now,
            }),
          }
        }
        case 'setSchedule': {
          const coach = getCurrentCoach(store, request)
          const slots = payload.slots
          if (!Array.isArray(slots)) throw new ApiError('INVALID_REQUEST', '排班内容格式不正确')
          return {
            ok: true,
            data: await store.transaction(() => {
              const ownSlots = slots.map((slot) => ({
                ...(slot as Omit<ScheduleSlot, 'coachId'>),
                coachId: coach.id,
              }))
              store.schedules.push(...ownSlots)
              return ownSlots
            }),
          }
        }
        case 'coachCancel': {
          const coach = getCurrentCoach(store, request)
          return {
            ok: true,
            data: await cancelLessonByCoach(
              store,
              coach.id,
              requiredString(payload, 'lessonId'),
              payload.consume === true,
              now,
            ),
          }
        }
        case 'adminLogin': {
          const username = requiredString(payload, 'username')
          const password = requiredString(payload, 'password')
          const admin = store.admins.find(
            (item) =>
              item.username === username && item.passwordHash === hashAdminPassword(password),
          )
          if (!admin) throw new ApiError('UNAUTHORIZED', '管理员账号或密码错误')
          const session = {
            id: store.nextId('session'),
            token: randomUUID(),
            adminId: admin.id,
            expiresAt: new Date(new Date(now).getTime() + 8 * 60 * 60 * 1000).toISOString(),
          }
          await store.transaction(() => store.sessions.push(session))
          return { ok: true, data: session }
        }
        case 'adminCrud': {
          requireAdmin(store, request, now)
          return {
            ok: true,
            data: await store.transaction(() => handleAdminCrud(store, payload)),
          }
        }
        case 'listBookings': {
          if (request.authToken) {
            requireAdmin(store, request, now)
            return { ok: true, data: store.lessons }
          }
          const user = getCurrentUser(store, request)
          const coach = store.coaches.find((item) => item.userId === user.id)
          return {
            ok: true,
            data: store.lessons.filter(
              (item) => item.memberId === user.id || item.coachId === coach?.id,
            ),
          }
        }
        case 'listAppeals':
          requireAdmin(store, request, now)
          return { ok: true, data: store.appeals }
        case 'decideAppeal': {
          const admin = requireAdmin(store, request, now)
          return {
            ok: true,
            data: await decideAppeal(store, {
              appealId: requiredString(payload, 'appealId'),
              decision: payload.decision === 'approve' ? 'approve' : 'reject',
              decisionNote: requiredString(payload, 'decisionNote'),
              adminId: admin.id,
              now,
            }),
          }
        }
        case 'adjustBalance': {
          const admin = requireAdmin(store, request, now)
          return {
            ok: true,
            data: await adjustBalance(store, {
              packageId: requiredString(payload, 'packageId'),
              delta: Number(payload.delta),
              note: requiredString(payload, 'note'),
              requestId: request.requestId,
              adminId: admin.id,
              now,
            }),
          }
        }
        default:
          throw new ApiError('UNKNOWN_ACTION', `不支持的操作：${request.action}`)
      }
    } catch (error) {
      return {
        ok: false,
        error: {
          code: error instanceof ApiError ? error.code : 'DOMAIN_ERROR',
          message: error instanceof Error ? error.message : '操作失败，请稍后重试',
        },
      }
    }
  }
}

interface LoadableStore extends Store {
  load?: () => Promise<void>
}

type IdentityProvider = () =>
  | { openId?: string }
  | undefined
  | Promise<{ openId?: string } | undefined>

export const createCloudHandler = (
  store: LoadableStore,
  environment: PaymentEnvironment,
  getServerIdentity: IdentityProvider,
) => {
  const router = createRouter(store, environment)
  return async (event: ApiRequest): Promise<ApiResponse> => {
    await store.load?.()
    const serverIdentity = await getServerIdentity()
    return router({
      ...event,
      identity: serverIdentity?.openId ? { openId: serverIdentity.openId } : undefined,
    })
  }
}

export const main = async (event: ApiRequest): Promise<ApiResponse> => {
  const app = init({ env: process.env.TCB_ENV })
  const store = new CloudBaseStore(app.database() as unknown as CloudDatabase)
  const paymentEndpoint = process.env.WECHAT_PAYMENT_CREATE_URL
  const paymentApiToken = process.env.WECHAT_PAYMENT_API_TOKEN
  const handler = createCloudHandler(
    store,
    {
      developmentPaymentsEnabled: process.env.DEVELOPMENT_PAYMENTS_ENABLED === 'true',
      production: process.env.NODE_ENV === 'production',
      createPaymentParameters:
        paymentEndpoint && paymentApiToken
          ? createWechatPaymentProvider({
              endpoint: paymentEndpoint,
              apiToken: paymentApiToken,
            })
          : undefined,
    },
    () => app.auth().getUserInfo(),
  )
  return handler(event)
}
