export type ApplicationMode = 'development' | 'production'

export interface EnvironmentInput {
  mode: ApplicationMode
  cloudEnvId?: string
  useDefaultCloudEnvironment: boolean
  useLocalData: boolean
  testPaymentEnabled: boolean
}

export type EnvironmentConfig = EnvironmentInput

export const resolveEnvironment = (input: EnvironmentInput): EnvironmentConfig => {
  if (
    input.mode === 'production' &&
    !input.cloudEnvId?.trim() &&
    !input.useDefaultCloudEnvironment
  ) {
    throw new Error('生产环境必须配置 CloudBase 环境或启用微信默认云环境')
  }
  if (input.mode === 'production' && input.testPaymentEnabled) {
    throw new Error('生产环境禁止测试支付')
  }
  if (input.mode === 'production' && input.useLocalData) {
    throw new Error('生产环境禁止使用本地模拟数据')
  }

  return input
}

export interface CloudInitializationOptions {
  traceUser: true
  env?: string
}

export const getCloudInitializationOptions = (
  environment: EnvironmentConfig,
): CloudInitializationOptions => ({
  traceUser: true,
  ...(environment.cloudEnvId?.trim() ? { env: environment.cloudEnvId.trim() } : {}),
})

const CLOUD_ENV_ID = 'cloud1-d1gmh1lu77f6e8c06'
const USE_DEFAULT_CLOUD_ENVIRONMENT = false
const USE_LOCAL_DEVELOPMENT_DATA = false

export const getEnvironment = (): EnvironmentConfig => {
  const wechat = globalThis as unknown as {
    wx: { getAccountInfoSync(): { miniProgram: { envVersion: string } } }
  }
  const envVersion = wechat.wx.getAccountInfoSync().miniProgram.envVersion
  const mode: ApplicationMode = envVersion === 'release' ? 'production' : 'development'

  return resolveEnvironment({
    mode,
    cloudEnvId: CLOUD_ENV_ID,
    useDefaultCloudEnvironment: USE_DEFAULT_CLOUD_ENVIRONMENT,
    useLocalData: mode === 'development' && USE_LOCAL_DEVELOPMENT_DATA,
    testPaymentEnabled: mode === 'development' && USE_LOCAL_DEVELOPMENT_DATA,
  })
}
