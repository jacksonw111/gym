export interface AdminEnvironmentInput {
  mode: string
  cloudEnvId: string
  mockDataEnabled: boolean
}

export type AdminEnvironment = { useMockData: true } | { useMockData: false; cloudEnvId: string }

export const resolveAdminEnvironment = (input: AdminEnvironmentInput): AdminEnvironment => {
  if (input.mode === 'test' || input.mockDataEnabled) {
    return { useMockData: true }
  }
  if (!input.cloudEnvId.trim()) {
    throw new Error('真实数据模式请配置 VITE_CLOUDBASE_ENV_ID')
  }
  return { useMockData: false, cloudEnvId: input.cloudEnvId.trim() }
}
