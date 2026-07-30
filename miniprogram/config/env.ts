export type ApplicationMode = 'development' | 'production'

export interface EnvironmentInput {
  mode: ApplicationMode
  cloudEnvId: string
  testPaymentEnabled: boolean
}

export interface EnvironmentConfig extends EnvironmentInput {
  useLocalData: boolean
}

export const resolveEnvironment = (input: EnvironmentInput): EnvironmentConfig => {
  if (input.mode === 'production' && input.cloudEnvId.trim() === '') {
    throw new Error('生产环境必须配置 CloudBase 环境')
  }
  if (input.mode === 'production' && input.testPaymentEnabled) {
    throw new Error('生产环境禁止测试支付')
  }

  return {
    ...input,
    useLocalData: input.mode === 'development',
  }
}

const CLOUD_ENV_ID = ''

export const getEnvironment = (): EnvironmentConfig => {
  const wechat = globalThis as unknown as {
    wx: { getAccountInfoSync(): { miniProgram: { envVersion: string } } }
  }
  const envVersion = wechat.wx.getAccountInfoSync().miniProgram.envVersion
  const mode: ApplicationMode = envVersion === 'release' ? 'production' : 'development'

  return resolveEnvironment({
    mode,
    cloudEnvId: CLOUD_ENV_ID,
    testPaymentEnabled: mode === 'development',
  })
}
