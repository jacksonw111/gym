import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const developmentMode = env.VITE_ADMIN_DEVELOPMENT === 'true'

  if (mode === 'production' && (developmentMode || !env.VITE_CLOUDBASE_ENV_ID)) {
    throw new Error('正式构建需要 VITE_CLOUDBASE_ENV_ID，且不能开启开发数据模式')
  }

  return {
    root: 'admin',
    plugins: [react()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 1000,
    },
  }
})
