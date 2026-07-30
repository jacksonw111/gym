import { developmentApi } from './development'
import { createProductionApi } from './production'

const developmentMode =
  import.meta.env.MODE === 'development' ||
  import.meta.env.MODE === 'test' ||
  import.meta.env.VITE_ADMIN_DEVELOPMENT === 'true'

export const adminApi = developmentMode
  ? developmentApi
  : createProductionApi(import.meta.env.VITE_CLOUDBASE_ENV_ID)
export type * from './types'
