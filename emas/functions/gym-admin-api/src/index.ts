import {
  createGymHandler,
  type ApiRequest,
  type GymEnvironment,
} from '../../../../server/gym'
import {
  composedJsonResponse,
  createRuntimeEnvironment,
  createRuntimeStore,
  type EmasRuntimeContext,
  headerValue,
  type HttpEvent,
  loadRuntimeSecrets,
  readHttpBody,
  type StoreFactory,
} from '../../runtime'

interface GymAdminEntrypointOptions {
  storeFactory: StoreFactory
  environmentFactory: (context: EmasRuntimeContext) => GymEnvironment
  allowedOrigin: string
}

export const createGymAdminEntrypoint =
  (options: GymAdminEntrypointOptions) =>
  async (context: EmasRuntimeContext) => {
    const event = context.args as HttpEvent
    const origin = headerValue(event.headers, 'origin')
    if (origin !== options.allowedOrigin) {
      return composedJsonResponse(403, {
        ok: false,
        error: { code: 'ORIGIN_FORBIDDEN', message: '当前网页来源不允许访问' },
      })
    }

    if (event.httpMethod === 'OPTIONS') {
      return {
        ...composedJsonResponse(204, {}),
        body: '',
      }
    }
    if (event.httpMethod !== 'POST') {
      return composedJsonResponse(
        405,
        {
          ok: false,
          error: { code: 'METHOD_NOT_ALLOWED', message: '只支持 POST 请求' },
        },
      )
    }

    let request: ApiRequest
    try {
      request = JSON.parse(readHttpBody(event)) as ApiRequest
    } catch {
      return composedJsonResponse(
        400,
        {
          ok: false,
          error: { code: 'INVALID_REQUEST', message: '请求内容格式不正确' },
        },
      )
    }

    const handler = createGymHandler(
      options.storeFactory(context),
      options.environmentFactory(context),
      async () => undefined,
    )
    return composedJsonResponse(200, await handler(request))
  }

export const main = async (context: EmasRuntimeContext) => {
  const secrets = loadRuntimeSecrets()
  if (!secrets.adminAllowedOrigin) {
    return composedJsonResponse(503, {
      ok: false,
      error: { code: 'CONFIG_ERROR', message: '后台访问地址未配置' },
    })
  }
  return createGymAdminEntrypoint({
    storeFactory: createRuntimeStore,
    environmentFactory: (currentContext) =>
      createRuntimeEnvironment(currentContext, secrets),
    allowedOrigin: secrets.adminAllowedOrigin,
  })(context)
}
