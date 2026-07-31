interface HttpResponse {
  status: number
  data: unknown
}

export interface EmasHttpClient {
  request(
    url: string,
    options: {
      method: 'GET' | 'POST'
      data?: unknown
      contentType?: 'json'
      dataType: 'json'
    },
  ): Promise<HttpResponse>
}

export interface WechatCredentials {
  appId: string
  appSecret: string
}

type JsonObject = Record<string, unknown>

const asObject = (value: unknown): JsonObject =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {}

export const createWechatPhoneResolver = (
  httpClient: EmasHttpClient,
  credentials: WechatCredentials,
  now: () => number = Date.now,
) => {
  let accessToken: string | undefined
  let accessTokenExpiresAt = 0

  const getAccessToken = async (): Promise<string> => {
    if (accessToken && now() < accessTokenExpiresAt) return accessToken

    const response = await httpClient.request(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(credentials.appId)}&secret=${encodeURIComponent(credentials.appSecret)}`,
      { method: 'GET', dataType: 'json' },
    )
    const data = asObject(response.data)
    if (response.status !== 200 || typeof data.access_token !== 'string') {
      throw new Error('手机号授权失败，请重试')
    }
    const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 7200
    accessToken = data.access_token
    accessTokenExpiresAt = now() + Math.max(0, expiresIn - 60) * 1000
    return accessToken
  }

  return async (code: string): Promise<string> => {
    const token = await getAccessToken()
    const response = await httpClient.request(
      `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        data: { code },
        contentType: 'json',
        dataType: 'json',
      },
    )
    const data = asObject(response.data)
    const phoneInfo = asObject(data.phone_info)
    const phoneNumber = phoneInfo.phoneNumber
    if (
      response.status !== 200 ||
      data.errcode !== 0 ||
      typeof phoneNumber !== 'string' ||
      !/^1[3-9]\d{9}$/.test(phoneNumber)
    ) {
      throw new Error('手机号授权失败，请重试')
    }
    return phoneNumber
  }
}
