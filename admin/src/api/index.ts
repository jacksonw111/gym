import { developmentApi } from './development'
import { resolveAdminEnvironment } from './environment'
import { createProductionApi } from './production'

const environment = resolveAdminEnvironment({
  mode: import.meta.env.MODE,
  adminApiUrl: import.meta.env.VITE_EMAS_ADMIN_API_URL ?? '',
  mockDataEnabled: import.meta.env.VITE_ADMIN_DEVELOPMENT === 'true',
})

export const adminApi = environment.useMockData
  ? developmentApi
  : createProductionApi(environment.adminApiUrl)
export type * from './types'
