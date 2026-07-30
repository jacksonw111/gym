import { grantPaidOrder } from './packages'
import type { MembershipPackage, Order, Store } from './store'

export interface PaymentParameters {
  timeStamp: string
  nonceStr: string
  package: string
  signType: 'MD5' | 'HMAC-SHA256' | 'RSA'
  paySign: string
}

export interface PaymentEnvironment {
  developmentPaymentsEnabled: boolean
  production: boolean
  createPaymentParameters?: (
    order: Order,
  ) => Promise<{ orderId: string; payment: PaymentParameters }>
}

interface PaymentServiceResponse {
  ok: boolean
  json(): Promise<unknown>
}

type PaymentServiceFetch = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string },
) => Promise<PaymentServiceResponse>

export const createWechatPaymentProvider = (
  config: { endpoint: string; apiToken: string },
  fetcher: PaymentServiceFetch = fetch,
): NonNullable<PaymentEnvironment['createPaymentParameters']> => {
  return async (order) => {
    const response = await fetcher(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ order }),
    })
    if (!response.ok) throw new Error('微信支付服务请求失败')
    const result = await response.json()
    if (!result || typeof result !== 'object') throw new Error('微信支付服务返回无效')
    const candidate = result as {
      orderId?: unknown
      payment?: Partial<PaymentParameters>
    }
    if (
      typeof candidate.orderId !== 'string' ||
      typeof candidate.payment?.timeStamp !== 'string' ||
      typeof candidate.payment.nonceStr !== 'string' ||
      typeof candidate.payment.package !== 'string' ||
      !['MD5', 'HMAC-SHA256', 'RSA'].includes(candidate.payment.signType ?? '') ||
      typeof candidate.payment.paySign !== 'string'
    ) {
      throw new Error('微信支付服务返回无效')
    }
    return {
      orderId: candidate.orderId,
      payment: candidate.payment as PaymentParameters,
    }
  }
}

export interface DevPaymentInput {
  orderId: string
  now: string
}

export const createDevPayment = async (
  store: Store,
  environment: PaymentEnvironment,
  input: DevPaymentInput,
): Promise<MembershipPackage> => {
  if (environment.production) throw new Error('生产环境禁止测试支付')
  if (!environment.developmentPaymentsEnabled) throw new Error('测试支付未开启')
  return grantPaidOrder(store, {
    orderId: input.orderId,
    paymentId: `dev-${input.orderId}`,
    paidAt: input.now,
  })
}

export interface WechatPaymentNotification {
  orderId: string
  paymentId: string
  paidAt: string
  verifiedServerNotification: boolean
}

export const processWechatPayment = async (
  store: Store,
  notification: WechatPaymentNotification,
): Promise<MembershipPackage> => {
  if (!notification.verifiedServerNotification) throw new Error('微信支付通知未通过服务端验证')
  return grantPaidOrder(store, notification)
}
