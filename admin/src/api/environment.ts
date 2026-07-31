export interface AdminEnvironmentInput {
  mode: string
  adminApiUrl: string
  mockDataEnabled: boolean
}

export type AdminEnvironment =
  | { useMockData: true }
  | { useMockData: false; adminApiUrl: string }

export const resolveAdminEnvironment = (input: AdminEnvironmentInput): AdminEnvironment => {
  if (input.mode === 'test' || input.mockDataEnabled) {
    return { useMockData: true }
  }
  if (!input.adminApiUrl.trim()) {
    throw new Error('真实数据模式请配置 VITE_EMAS_ADMIN_API_URL')
  }
  return { useMockData: false, adminApiUrl: input.adminApiUrl.trim() }
}
