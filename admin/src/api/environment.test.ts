import { describe, expect, it } from 'vitest'
import { resolveAdminEnvironment } from './environment'

describe('admin data environment', () => {
  it('uses the EMAS admin HTTP API by default during local development', () => {
    expect(
      resolveAdminEnvironment({
        mode: 'development',
        adminApiUrl: 'https://api.example.com/gym-admin-api',
        mockDataEnabled: false,
      }),
    ).toEqual({
      useMockData: false,
      adminApiUrl: 'https://api.example.com/gym-admin-api',
    })
  })

  it('only uses mock data when explicitly enabled or under tests', () => {
    expect(
      resolveAdminEnvironment({
        mode: 'development',
        adminApiUrl: '',
        mockDataEnabled: true,
      }),
    ).toEqual({ useMockData: true })
    expect(
      resolveAdminEnvironment({
        mode: 'test',
        adminApiUrl: '',
        mockDataEnabled: false,
      }),
    ).toEqual({ useMockData: true })
  })

  it('rejects a real-data session without an EMAS admin API URL', () => {
    expect(() =>
      resolveAdminEnvironment({
        mode: 'development',
        adminApiUrl: '',
        mockDataEnabled: false,
      }),
    ).toThrow('请配置 VITE_EMAS_ADMIN_API_URL')
  })
})
