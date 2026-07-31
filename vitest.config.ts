import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'tests/**/*.test.ts',
      'server/**/*.test.ts',
      'emas/**/*.test.ts',
      'admin/src/**/*.test.{ts,tsx}',
    ],
  },
})
