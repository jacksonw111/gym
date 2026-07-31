import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const developmentMode = env.VITE_ADMIN_DEVELOPMENT === 'true'

  if (mode === 'production' && (developmentMode || !env.VITE_EMAS_ADMIN_API_URL)) {
    throw new Error('正式构建需要 VITE_EMAS_ADMIN_API_URL，且不能开启开发数据模式')
  }

  return {
    root: 'admin',
    base: mode === 'production' ? '/admin/' : '/',
    plugins: [react()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 1000,
    },
  }
})
