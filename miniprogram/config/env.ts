export type ApplicationMode = 'development' | 'production'

export interface EmasClientConfig {
  appId: string
  spaceId: string
  clientSecret: string
  endpoint: string
}

export interface EnvironmentInput {
  mode: ApplicationMode
  emas: EmasClientConfig
  useLocalData: boolean
  testPaymentEnabled: boolean
}

export type EnvironmentConfig = EnvironmentInput

const hasCompleteEmasConfig = (config: EmasClientConfig): boolean =>
  Boolean(
    config.appId.trim() &&
      config.spaceId.trim() &&
      config.clientSecret.trim() &&
      config.endpoint.trim(),
  )

export const resolveEnvironment = (input: EnvironmentInput): EnvironmentConfig => {
  if (input.mode === 'production' && !hasCompleteEmasConfig(input.emas)) {
    throw new Error('生产环境必须配置 EMAS 服务空间')
  }
  if (input.mode === 'production' && input.testPaymentEnabled) {
    throw new Error('生产环境禁止测试支付')
  }
  if (input.mode === 'production' && input.useLocalData) {
    throw new Error('生产环境禁止使用本地模拟数据')
  }

  return input
}

const localConfig = require('./emas.local.js') as EmasClientConfig
const USE_LOCAL_DEVELOPMENT_DATA = false
const ENABLE_TEST_PAYMENT_IN_NON_RELEASE_BUILDS = true

export const getEnvironment = (): EnvironmentConfig => {
  const wechat = globalThis as unknown as {
    wx: { getAccountInfoSync(): { miniProgram: { envVersion: string } } }
  }
  const envVersion = wechat.wx.getAccountInfoSync().miniProgram.envVersion
  const mode: ApplicationMode = envVersion === 'release' ? 'production' : 'development'

  return resolveEnvironment({
    mode,
    emas: localConfig,
    useLocalData: mode === 'development' && USE_LOCAL_DEVELOPMENT_DATA,
    testPaymentEnabled: mode === 'development' && ENABLE_TEST_PAYMENT_IN_NON_RELEASE_BUILDS,
  })
}
