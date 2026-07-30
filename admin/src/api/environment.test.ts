import { describe, expect, it } from 'vitest'
import { resolveAdminEnvironment } from './environment'

describe('admin data environment', () => {
  it('uses CloudBase by default during local development', () => {
    expect(
      resolveAdminEnvironment({
        mode: 'development',
        cloudEnvId: 'cloud-env',
        mockDataEnabled: false,
      }),
    ).toEqual({ useMockData: false, cloudEnvId: 'cloud-env' })
  })

  it('only uses mock data when explicitly enabled or under tests', () => {
    expect(
      resolveAdminEnvironment({
        mode: 'development',
        cloudEnvId: '',
        mockDataEnabled: true,
      }),
    ).toEqual({ useMockData: true })
    expect(
      resolveAdminEnvironment({
        mode: 'test',
        cloudEnvId: '',
        mockDataEnabled: false,
      }),
    ).toEqual({ useMockData: true })
  })

  it('rejects a real-data session without a CloudBase environment id', () => {
    expect(() =>
      resolveAdminEnvironment({
        mode: 'development',
        cloudEnvId: '',
        mockDataEnabled: false,
      }),
    ).toThrow('请配置 VITE_CLOUDBASE_ENV_ID')
  })
})
