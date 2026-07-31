import {
  createPaymentNotificationHandler,
  createRemoteWechatNotificationVerifier,
  type WechatPaymentNotificationVerifier,
} from '../../../../server/gym/payment'
import { DomainError } from '../../../../server/gym/store'
import {
  composedJsonResponse,
  createRuntimeStore,
  type EmasRuntimeContext,
  type HttpEvent,
  loadRuntimeSecrets,
  readHttpBody,
  type RuntimeHttpClient,
  type StoreFactory,
} from '../../runtime'

interface PaymentNotifyEntrypointOptions {
  storeFactory: StoreFactory
  verifierFactory?: (
    context: EmasRuntimeContext,
  ) => WechatPaymentNotificationVerifier | undefined
}

const createPaymentFetch = (httpClient: RuntimeHttpClient) => {
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

export const createPaymentNotifyEntrypoint =
  (options: PaymentNotifyEntrypointOptions) =>
  async (context: EmasRuntimeContext) => {
    const event = context.args as HttpEvent
    if (event.httpMethod !== 'POST') {
      return composedJsonResponse(405, {
        code: 'METHOD_NOT_ALLOWED',
        message: '只支持 POST 请求',
      })
    }
    const verifier = options.verifierFactory?.(context)
    if (!verifier) {
      return composedJsonResponse(503, {
        code: 'CONFIG_ERROR',
        message: '微信支付商户验证服务未配置',
      })
    }

    try {
      const store = options.storeFactory(context)
      await store.load?.()
      await createPaymentNotificationHandler(store, verifier)({
        headers: event.headers ?? {},
        body: readHttpBody(event),
      })
      return composedJsonResponse(200, { code: 'SUCCESS', message: '成功' })
    } catch (error) {
      if (error instanceof DomainError) {
        return composedJsonResponse(401, {
          code: 'VERIFY_FAILED',
          message: error.message,
        })
      }
      return composedJsonResponse(500, {
        code: 'INTERNAL_ERROR',
        message: '操作失败，请稍后重试',
      })
    }
  }

export const main = async (context: EmasRuntimeContext) => {
  const secrets = loadRuntimeSecrets()
  return createPaymentNotifyEntrypoint({
    storeFactory: createRuntimeStore,
    verifierFactory: (currentContext) =>
      secrets.paymentVerifyEndpoint && secrets.paymentApiToken
        ? createRemoteWechatNotificationVerifier(
            {
              endpoint: secrets.paymentVerifyEndpoint,
              apiToken: secrets.paymentApiToken,
            },
            createPaymentFetch(currentContext.httpclient),
          )
        : undefined,
  })(context)
}
