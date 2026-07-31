import { grantPaidOrder } from './packages'
import { DomainError, type MembershipPackage, type Order, type Store } from './store'

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
  if (environment.production) throw new DomainError('生产环境禁止测试支付')
  if (!environment.developmentPaymentsEnabled) throw new DomainError('测试支付未开启')
  return grantPaidOrder(store, {
    orderId: input.orderId,
    paymentId: `dev-${input.orderId}`,
    paidAt: input.now,
  })
}

export interface RawWechatPaymentNotification {
  headers: Record<string, string>
  body: string
}

export interface VerifiedWechatPayment {
  orderId: string
  paymentId: string
  paidAt: string
}

export interface WechatPaymentNotificationVerifier {
  verify(notification: RawWechatPaymentNotification): Promise<VerifiedWechatPayment>
}

export const createPaymentNotificationHandler = (
  store: Store,
  verifier?: WechatPaymentNotificationVerifier,
) => {
  return async (notification: RawWechatPaymentNotification): Promise<MembershipPackage> => {
    if (!verifier) throw new DomainError('微信支付商户验证服务未配置')
    const verified = await verifier.verify(notification)
    return grantPaidOrder(store, verified)
  }
}

export const createRemoteWechatNotificationVerifier = (
  config: { endpoint: string; apiToken: string },
  fetcher: PaymentServiceFetch = fetch,
): WechatPaymentNotificationVerifier => ({
  async verify(notification) {
    const response = await fetcher(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(notification),
    })
    if (!response.ok) throw new DomainError('微信支付平台签名验证失败')
    const result = await response.json()
    if (!result || typeof result !== 'object') {
      throw new Error('微信支付验证服务返回无效')
    }
    const candidate = result as Partial<VerifiedWechatPayment>
    if (
      typeof candidate.orderId !== 'string' ||
      typeof candidate.paymentId !== 'string' ||
      typeof candidate.paidAt !== 'string'
    ) {
      throw new Error('微信支付验证服务返回无效')
    }
    return candidate as VerifiedWechatPayment
  },
})
