import { init } from '@cloudbase/node-sdk'
import { grantPaidOrder } from '../../gym-api/src/packages'
import { createRemoteWechatNotificationVerifier } from '../../gym-api/src/payment'
import { DomainError } from '../../gym-api/src/store'
import { CloudBaseStore, type CloudDatabase } from '../../gym-api/src/store-cloudbase'

interface HttpEvent {
  headers?: Record<string, string>
  body?: string
  isBase64Encoded?: boolean
}

interface HttpResponse {
  statusCode: number
  headers: Record<string, string>
  body: string
}

const jsonResponse = (statusCode: number, body: Record<string, string>): HttpResponse => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
})

export const main = async (event: HttpEvent): Promise<HttpResponse> => {
  const endpoint = process.env.WECHAT_PAYMENT_VERIFY_URL
  const apiToken = process.env.WECHAT_PAYMENT_API_TOKEN
  if (!endpoint || !apiToken) {
    return jsonResponse(503, {
      code: 'CONFIG_ERROR',
      message: '微信支付商户验证服务未配置',
    })
  }

  try {
    const app = init({ env: process.env.TCB_ENV })
    const store = new CloudBaseStore(app.database() as unknown as CloudDatabase)
    const payment = await createRemoteWechatNotificationVerifier({ endpoint, apiToken }).verify({
      headers: event.headers ?? {},
      body: event.isBase64Encoded
        ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
        : (event.body ?? ''),
    })
    await store.prepare({
      action: 'grantPaidOrder',
      requestId: `payment-${payment.paymentId}`,
      payload: { ...payment },
    })
    await grantPaidOrder(store, payment)
    return jsonResponse(200, { code: 'SUCCESS', message: '成功' })
  } catch (error) {
    console.error('wechat payment notification error', error)
    if (error instanceof DomainError) {
      return jsonResponse(401, { code: 'VERIFY_FAILED', message: error.message })
    }
    return jsonResponse(500, {
      code: 'INTERNAL_ERROR',
      message: '操作失败，请稍后重试',
    })
  }
}
