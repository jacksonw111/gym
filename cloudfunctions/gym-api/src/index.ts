import { randomUUID } from 'node:crypto'
import { init } from '@cloudbase/node-sdk'
import * as wxCloud from 'wx-server-sdk'
import { createAppeal, decideAppeal } from './appeals'
import type { Actor } from './auth'
import {
  autoCompleteDueLessons,
  bookLesson,
  cancelLessonByCoach,
  cancelLessonByMember,
  completeLesson,
  saveFeedback,
} from './lessons'
import { adjustBalance, createOrder } from './packages'
import { createDevPayment, createWechatPaymentProvider, type PaymentEnvironment } from './payment'
import { phoneNumberFromOpenData } from './phone'
import { hashAdminPassword } from './seed'
import {
  type Admin,
  type Coach,
  cloneJson,
  DomainError,
  type Product,
  type ScheduleSlot,
  type Store,
  type User,
} from './store'
import { CloudBaseStore, type CloudDatabase } from './store-cloudbase'

wxCloud.init({ env: wxCloud.DYNAMIC_CURRENT_ENV as unknown as string })

export interface ApiRequest {
  action: string
  requestId: string
  payload: unknown
  identity?: { openId: string }
  authToken?: string
  internalToken?: string
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

export interface GymEnvironment extends PaymentEnvironment {
  resolvePhoneNumber?: (cloudId: string) => Promise<string>
}

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

const defaultScheduleSlots = (store: Store, coachId: string, date: string): ScheduleSlot[] => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00+08:00`))) {
    throw new ApiError('INVALID_REQUEST', '日期格式不正确')
  }
  const slots: ScheduleSlot[] = []
  for (let hour = 10; hour < 21; hour += 1) {
    const hourText = String(hour).padStart(2, '0')
    const nextHourText = String(hour + 1).padStart(2, '0')
    const startsAt = `${date}T${hourText}:00:00+08:00`
    const existing = store.schedules.find(
      (item) => item.coachId === coachId && item.startsAt === startsAt,
    )
    slots.push(
      existing ?? {
        id: `slot-${coachId}-${date}-${hourText}`,
        coachId,
        startsAt,
        endsAt: `${date}T${nextHourText}:00:00+08:00`,
        open: true,
      },
    )
  }
  return slots
}

const getCurrentCoach = (store: Store, request: ApiRequest): Coach => {
  const user = getCurrentUser(store, request)
  if (!user.roles.includes('coach')) {
    throw new ApiError('UNAUTHORIZED', '当前账号没有教练权限')
  }
  const coach = store.coaches.find((item) => item.userId === user.id)
  if (coach?.status !== 'active') {
    throw new ApiError('UNAUTHORIZED', '教练账号不存在或已停用')
  }
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
  ledger: store.ledger,
  schedules: store.schedules,
})

const errorResponse = (error: unknown): ApiResponse => {
  if (error instanceof ApiError) {
    return { ok: false, error: { code: error.code, message: error.message } }
  }
  if (error instanceof DomainError) {
    return { ok: false, error: { code: 'DOMAIN_ERROR', message: error.message } }
  }
  console.error('gym-api internal error', error)
  return {
    ok: false,
    error: { code: 'INTERNAL_ERROR', message: '操作失败，请稍后重试' },
  }
}

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
    if (!existing) throw new DomainError('记录不存在')
    return existing
  }
  if (operation === 'save') {
    if (resource === 'coaches') {
      const userId = requiredString(value, 'userId')
      const user = store.users.find((item) => item.id === userId)
      if (!user) throw new DomainError('关联的小程序用户不存在')
      const duplicate = store.coaches.find((item) => item.userId === userId && item.id !== id)
      if (duplicate) throw new DomainError('该小程序用户已经绑定教练')
      if (!user.roles.includes('coach')) user.roles.push('coach')
      if (existingIndex < 0) value.status = 'active'
    }
    const record = { ...cloneJson(value), id } as unknown as User | Coach | Product
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
    if (!existing) throw new DomainError('记录不存在')
    if (!('status' in existing)) throw new DomainError('该资源不支持状态变更')
    const status = requiredString(value, 'status')
    if (
      (resource === 'coaches' && !['active', 'inactive'].includes(status)) ||
      (resource === 'packages' && !['published', 'unpublished'].includes(status))
    ) {
      throw new DomainError('状态值不合法')
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
  environment: GymEnvironment,
  nowProvider: () => string = () => new Date().toISOString(),
) => {
  return async (request: ApiRequest): Promise<ApiResponse> => {
    try {
      const payload = asObject(request.payload)
      const now = nowProvider()
      switch (request.action) {
        case 'bootstrap': {
          const currentUser = request.identity?.openId
            ? store.users.find((item) => item.openId === request.identity?.openId)
            : undefined
          if (!currentUser) {
            return {
              ok: true,
              data: {
                authenticated: false,
                actor: null,
                profile: null,
                roles: [],
                activeRole: null,
                packages: store.products.filter((item) => item.status === 'published'),
                coaches: store.coaches.filter((item) => item.status === 'active'),
                memberships: [],
                lessons: [],
                appeals: [],
                orders: [],
                coach: { schedule: [], lessons: [] },
              },
            }
          }
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
          const coachLessons = coach
            ? store.lessons
                .filter((item) => item.coachId === coach.id)
                .map((lesson) => {
                  const member = store.users.find((item) => item.id === lesson.memberId)
                  return {
                    ...lesson,
                    memberName: member?.name ?? '',
                    memberPhone: member?.phone ?? '',
                  }
                })
            : []
          const actor = {
            kind: activeRole,
            id: activeRole === 'coach' ? (coach as Coach).id : currentUser.id,
          }
          return {
            ok: true,
            data: {
              authenticated: true,
              actor,
              profile: currentUser,
              roles: currentUser.roles,
              activeRole,
              packages: store.products.filter((item) => item.status === 'published'),
              coaches: store.coaches.filter((item) => item.status === 'active'),
              memberships: store.packages.filter((item) => item.memberId === currentUser.id),
              lessons: coach
                ? coachLessons
                : store.lessons.filter((item) => item.memberId === currentUser.id),
              appeals: store.appeals.filter((item) =>
                coach
                  ? store.lessons.some(
                      (lesson) => lesson.id === item.lessonId && lesson.coachId === coach.id,
                    )
                  : item.memberId === currentUser.id,
              ),
              coach: {
                schedule: coach ? store.schedules.filter((item) => item.coachId === coach.id) : [],
                lessons: coachLessons,
              },
              orders: store.orders
                .filter((item) => item.memberId === currentUser.id)
                .map((item) => ({
                  id: item.id,
                  status: item.status,
                  membershipId: item.packageId,
                })),
            },
          }
        }
        case 'listPackages':
          return { ok: true, data: store.products.filter((item) => item.status === 'published') }
        case 'listCoaches':
          return { ok: true, data: store.coaches.filter((item) => item.status === 'active') }
        case 'registerMember': {
          const openId = request.identity?.openId
          if (!openId) throw new ApiError('UNAUTHORIZED', '无法获取微信用户身份')
          const name = requiredString(payload, 'name').trim()
          const avatarUrl = requiredString(payload, 'avatarUrl')
          const phoneCloudId = requiredString(payload, 'phoneCloudId')
          if (name.length < 1 || name.length > 32) {
            throw new ApiError('INVALID_REQUEST', '昵称长度应为 1—32 个字符')
          }
          if (!avatarUrl.startsWith('cloud://')) {
            throw new ApiError('INVALID_REQUEST', '头像必须来自当前云存储')
          }
          if (!environment.resolvePhoneNumber) {
            throw new ApiError('SERVICE_UNAVAILABLE', '手机号授权服务未配置')
          }
          const phone = await environment.resolvePhoneNumber(phoneCloudId)
          const user = await store.transaction(() => {
            const existing = store.users.find((item) => item.openId === openId)
            if (existing) {
              existing.name = name
              existing.avatarUrl = avatarUrl
              existing.phone = phone
              if (!existing.roles.includes('member')) existing.roles.push('member')
              return existing
            }
            const created: User = {
              id: store.nextId('user'),
              openId,
              name,
              avatarUrl,
              phone,
              roles: ['member'],
            }
            store.users.push(created)
            return created
          })
          return { ok: true, data: user }
        }
        case 'getSchedule': {
          const coachId = requiredString(payload, 'coachId')
          const coach = store.coaches.find(
            (item) => item.id === coachId && item.status === 'active',
          )
          if (!coach) throw new ApiError('NOT_FOUND', '教练不存在或已停用')
          const requestedDate = typeof payload.date === 'string' ? payload.date : undefined
          if (requestedDate) {
            await store.transaction(() => {
              const slots = defaultScheduleSlots(store, coachId, requestedDate)
              for (const slot of slots) {
                if (!store.schedules.some((item) => item.id === slot.id)) {
                  store.schedules.push(slot)
                }
              }
            })
          }
          const currentUser = request.identity?.openId
            ? store.users.find((item) => item.openId === request.identity?.openId)
            : undefined
          const currentCoach = currentUser?.roles.includes('coach')
            ? store.coaches.find(
                (item) =>
                  item.userId === currentUser.id && item.id === coachId && item.status === 'active',
              )
            : undefined
          return {
            ok: true,
            data: store.schedules
              .filter(
                (item) =>
                  item.coachId === coachId &&
                  (!requestedDate || item.startsAt.startsWith(requestedDate)) &&
                  (payload.includeClosed === true || item.open),
              )
              .map((slot) => {
                const lesson = store.lessons.find(
                  (item) =>
                    item.coachId === slot.coachId &&
                    item.startsAt === slot.startsAt &&
                    item.status === 'booked',
                )
                const member = currentCoach
                  ? store.users.find((item) => item.id === lesson?.memberId)
                  : undefined
                return {
                  ...slot,
                  occupied: Boolean(lesson),
                  ...(lesson && lesson.memberId === currentUser?.id ? { lessonId: lesson.id } : {}),
                  ...(currentCoach && lesson
                    ? {
                        lessonId: lesson.id,
                        memberName: member?.name ?? '',
                        memberPhone: member?.phone ?? '',
                      }
                    : {}),
                }
              }),
          }
        }
        case 'purchase': {
          const member = getCurrentUser(store, request)
          const order = await createOrder(store, {
            requestId: request.requestId,
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
          const date = requiredString(payload, 'date')
          const slots = payload.slots
          if (!Array.isArray(slots)) throw new ApiError('INVALID_REQUEST', '排班内容格式不正确')
          return {
            ok: true,
            data: await store.transaction(() => {
              const updatedSlots = slots.map((slot) => {
                const value = asObject(slot)
                const startsAt = requiredString(value, 'startsAt')
                const endsAt = requiredString(value, 'endsAt')
                const open = value.open
                const match = startsAt.match(
                  new RegExp(`^${date}T(\\d{2}):00:00(?:\\.000)?\\+08:00$`),
                )
                const hour = match ? Number(match[1]) : Number.NaN
                if (
                  (open !== true && open !== false) ||
                  !match ||
                  hour < 10 ||
                  hour >= 21 ||
                  Date.parse(endsAt) - Date.parse(startsAt) !== 60 * 60 * 1000
                ) {
                  throw new ApiError('INVALID_REQUEST', '排班时段必须是 10:00—21:00 的整点一小时')
                }
                const existing = store.schedules.find(
                  (item) => item.coachId === coach.id && item.startsAt === startsAt,
                )
                if (existing) {
                  existing.endsAt = endsAt
                  existing.open = open
                  return existing
                }
                const created: ScheduleSlot = {
                  id: `slot-${coach.id}-${date}-${String(hour).padStart(2, '0')}`,
                  coachId: coach.id,
                  startsAt,
                  endsAt,
                  open,
                }
                store.schedules.push(created)
                return created
              })
              return updatedSlots
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
      return errorResponse(error)
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
  environment: GymEnvironment,
  getServerIdentity: IdentityProvider,
) => {
  const router = createRouter(store, environment)
  return async (event: ApiRequest): Promise<ApiResponse> => {
    try {
      await store.load?.()
      const serverIdentity = await getServerIdentity()
      return router({
        ...event,
        identity: serverIdentity?.openId ? { openId: serverIdentity.openId } : undefined,
      })
    } catch (error) {
      return errorResponse(error)
    }
  }
}

export const createInternalSchedulerHandler = (
  store: Store,
  expectedToken: string | undefined,
  nowProvider: () => string = () => new Date().toISOString(),
) => {
  return async (providedToken: string | undefined): Promise<ApiResponse> => {
    if (!expectedToken || providedToken !== expectedToken) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: '内部定时任务认证失败' },
      }
    }
    try {
      const completedLessonIds = await autoCompleteDueLessons(store, nowProvider())
      return { ok: true, data: { completedLessonIds } }
    } catch (error) {
      return errorResponse(error)
    }
  }
}

export const main = async (event: ApiRequest): Promise<ApiResponse> => {
  const app = init({ env: process.env.TCB_ENV })
  const store = new CloudBaseStore(app.database() as unknown as CloudDatabase)
  if (event.action === '__internalAutoCompleteLessons') {
    try {
      await store.load()
    } catch (error) {
      return errorResponse(error)
    }
    return createInternalSchedulerHandler(
      store,
      process.env.INTERNAL_SCHEDULER_TOKEN,
    )(event.internalToken)
  }
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
      resolvePhoneNumber: async (cloudId) =>
        phoneNumberFromOpenData(await wxCloud.getOpenData({ list: [cloudId] })),
    },
    () => app.auth().getUserInfo(),
  )
  return handler(event)
}
