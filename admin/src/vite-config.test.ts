import type { ConfigEnv, UserConfig } from 'vite'
import { describe, expect, it } from 'vitest'
import createConfig from '../vite.config'

describe('admin Vite config', () => {
  it('让网页源码从项目根目录读取云环境编号', async () => {
    const config = await (
      createConfig as (environment: ConfigEnv) => UserConfig | Promise<UserConfig>
    )({ command: 'build', mode: 'development', isSsrBuild: false, isPreview: false })

    expect(config.envDir).toBe(process.cwd())
  })
})
