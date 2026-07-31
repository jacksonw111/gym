import type { GymEnvironment } from '../../server/gym'
import { createWechatPaymentProvider } from '../../server/gym/payment'
import type { Store } from '../../server/gym/store'
import { EmasStore, type EmasDatabase } from '../../server/gym/store-emas'
import { createWechatPhoneResolver } from '../../server/gym/wechat-phone'

export interface RuntimeSecrets {
  wechatAppId?: string
  wechatAppSecret?: string
  adminAllowedOrigin?: string
  paymentCreateEndpoint?: string
  paymentVerifyEndpoint?: string
  paymentApiToken?: string
  production?: boolean
  developmentPaymentsEnabled?: boolean
}

export interface RuntimeHttpResponse {
  status: number
  data: unknown
}

export interface RuntimeHttpClient {
  request(
    url: string,
    options: {
      method: 'GET' | 'POST'
      headers?: Record<string, string>
      data?: unknown
      contentType?: 'json'
      dataType: 'json'
    },
  ): Promise<RuntimeHttpResponse>
}

export interface EmasRuntimeContext {
  args: unknown
  mpserverless: {
    db: EmasDatabase
    user: {
      // 云函数端 SDK 的 getInfo 直接返回 result 对象，与客户端返回结构不同
      getInfo(): Promise<unknown>
    }
  }
  httpclient: RuntimeHttpClient
}

export interface LoadableStore extends Store {
  load?: () => Promise<void>
}

export type StoreFactory = (context: EmasRuntimeContext) => LoadableStore

export const createRuntimeStore: StoreFactory = (context) =>
  new EmasStore(context.mpserverless.db)

export const loadRuntimeSecrets = (): RuntimeSecrets =>
  require('./secrets.json') as RuntimeSecrets

const asPaymentFetch = (httpClient: RuntimeHttpClient) => {
  return async (
    url: string,
    input: { method: 'POST'; headers: Record<string, string>; body: string },
  ) => {
    const response = await httpClient.request(url, {
      method: input.method,
      headers: input.headers,
      data: input.body,
      contentType: 'json',
      dataType: 'json',
    })
    return {
      ok: response.status >= 200 && response.status < 300,
      json: async () => response.data,
    }
  }
}

export const createRuntimeEnvironment = (
  context: EmasRuntimeContext,
  secrets: RuntimeSecrets,
): GymEnvironment => {
  const environment: GymEnvironment = {
    production: secrets.production !== false,
    developmentPaymentsEnabled: secrets.developmentPaymentsEnabled === true,
  }

  if (secrets.wechatAppId && secrets.wechatAppSecret) {
    environment.resolvePhoneNumber = createWechatPhoneResolver(
      context.httpclient,
      {
        appId: secrets.wechatAppId,
        appSecret: secrets.wechatAppSecret,
      },
    )
  }

  if (secrets.paymentCreateEndpoint && secrets.paymentApiToken) {
    environment.createPaymentParameters = createWechatPaymentProvider(
      {
        endpoint: secrets.paymentCreateEndpoint,
        apiToken: secrets.paymentApiToken,
      },
      asPaymentFetch(context.httpclient),
    )
  }

  return environment
}

export interface HttpEvent {
  httpMethod?: string
  headers?: Record<string, string>
  body?: string
  isBase64Encoded?: boolean
}

export interface ComposedHttpResponse {
  mpserverlessComposedResponse: true
  isBase64Encoded: false
  statusCode: number
  headers: Record<string, string>
  body: string
}

export const headerValue = (
  headers: Record<string, string> | undefined,
  name: string,
): string | undefined => {
  const key = Object.keys(headers ?? {}).find((item) => item.toLowerCase() === name.toLowerCase())
  return key ? headers?.[key] : undefined
}

export const composedJsonResponse = (
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
): ComposedHttpResponse => ({
  mpserverlessComposedResponse: true,
  isBase64Encoded: false,
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    ...headers,
  },
  body: JSON.stringify(body),
})

export const readHttpBody = (event: HttpEvent): string =>
  event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
    : (event.body ?? '')
