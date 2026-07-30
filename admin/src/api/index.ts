import { developmentApi } from './development'
import { resolveAdminEnvironment } from './environment'
import { createProductionApi } from './production'

const environment = resolveAdminEnvironment({
  mode: import.meta.env.MODE,
  cloudEnvId: import.meta.env.VITE_CLOUDBASE_ENV_ID ?? '',
  mockDataEnabled: import.meta.env.VITE_ADMIN_DEVELOPMENT === 'true',
})

export const adminApi = environment.useMockData
  ? developmentApi
  : createProductionApi(environment.cloudEnvId)
export type * from './types'
