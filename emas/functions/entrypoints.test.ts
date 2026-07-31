import { describe, expect, it, vi } from 'vitest'
import { createDevelopmentSeed } from '../../server/gym/seed'
import { MemoryStore } from '../../server/gym/store'
import { createAutoCompleteEntrypoint } from './auto-complete-lessons/src/index'
import { createGymAdminEntrypoint } from './gym-admin-api/src/index'
import { createGymApiEntrypoint } from './gym-api/src/index'
import { createPaymentNotifyEntrypoint } from './wechat-payment-notify/src/index'

const productionEnvironment = {
  developmentPaymentsEnabled: false,
  production: true,
}

describe('EMAS function entrypoints', () => {
  it('passes ctx.args to the mini-program gym handler', async () => {
    const store = new MemoryStore(createDevelopmentSeed())
    const entrypoint = createGymApiEntrypoint({
      storeFactory: () => store,
      environmentFactory: () => productionEnvironment,
      identityProvider: async () => undefined,
    })

    const response = await entrypoint({
      args: {
        action: 'listPackages',
        requestId: 'request-1',
        payload: {},
      },
    } as never)

    expect(response).toMatchObject({
      ok: true,
      data: [{ id: 'product-1' }],
    })
  })

  it('handles admin preflight and rejects an unapproved origin', async () => {
    const entrypoint = createGymAdminEntrypoint({
      storeFactory: () => new MemoryStore(createDevelopmentSeed()),
      environmentFactory: () => productionEnvironment,
      allowedOrigin: 'https://admin.example.com',
    })

    const preflight = await entrypoint({
      args: {
        httpMethod: 'OPTIONS',
        headers: { origin: 'https://admin.example.com' },
      },
    } as never)
    expect(preflight).toMatchObject({
      mpserverlessComposedResponse: true,
      statusCode: 204,
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
    })

    const rejected = await entrypoint({
      args: {
        httpMethod: 'POST',
        headers: { origin: 'https://other.example.com' },
        body: '{}',
      },
    } as never)
    expect(rejected.statusCode).toBe(403)
  })

  it('parses an approved admin POST request and returns a composed response', async () => {
    const entrypoint = createGymAdminEntrypoint({
      storeFactory: () => new MemoryStore(createDevelopmentSeed()),
      environmentFactory: () => productionEnvironment,
      allowedOrigin: 'https://admin.example.com',
    })

    const response = await entrypoint({
      args: {
        httpMethod: 'POST',
        headers: { origin: 'https://admin.example.com' },
        body: JSON.stringify({
          action: 'adminLogin',
          requestId: 'admin-login-1',
          payload: { username: 'admin', password: 'dev-admin-password' },
        }),
      },
    } as never)

    expect(response.mpserverlessComposedResponse).toBe(true)
    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toMatchObject({
      ok: true,
      data: { adminId: 'admin-1' },
    })
  })

  it('runs lesson auto-completion directly in the scheduled function', async () => {
    const store = new MemoryStore(createDevelopmentSeed())
    const load = vi.fn(async () => undefined)
    Object.assign(store, { load })
    const entrypoint = createAutoCompleteEntrypoint({
      storeFactory: () => store,
      nowProvider: () => '2026-08-02T00:00:00.000Z',
    })

    await expect(entrypoint({ args: {} } as never)).resolves.toEqual({
      ok: true,
      data: { completedLessonIds: [] },
    })
    expect(load).toHaveBeenCalledOnce()
  })

  it('rejects payment callbacks when verification is not configured', async () => {
    const entrypoint = createPaymentNotifyEntrypoint({
      storeFactory: () => new MemoryStore(createDevelopmentSeed()),
    })

    const response = await entrypoint({
      args: {
        httpMethod: 'POST',
        headers: {},
        body: '{}',
      },
    } as never)

    expect(response.statusCode).toBe(503)
    expect(JSON.parse(response.body)).toEqual({
      code: 'CONFIG_ERROR',
      message: '微信支付商户验证服务未配置',
    })
  })
})
