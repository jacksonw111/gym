import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspace = join(import.meta.dirname, '../..')

describe('cloud provider boundary', () => {
  it('contains only the EMAS runtime', () => {
    expect(existsSync(join(workspace, 'server/gym/index.ts'))).toBe(true)
    for (const path of [
      'cloudfunctions',
      'cloudbaserc.json',
      'database.rules.json',
      'database.indexes.json',
      'server/gym/store-cloudbase.ts',
    ]) {
      expect(existsSync(join(workspace, path)), path).toBe(false)
    }

    const forbidden = [
      'wx.cloud',
      `@cloud${'base/'}`,
      'wx-server-sdk',
      `cloudfunction${'Root'}`,
      `CLOUD${'BASE_ENV_ID'}`,
    ]
    const tracked = execFileSync('git', ['ls-files'], {
      cwd: workspace,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean)
      .filter(
        (path) => !path.startsWith('docs/') && path !== 'tests/config/no-tencent-runtime.test.ts',
      )
      .filter((path) => existsSync(join(workspace, path)))
    const matches = tracked.flatMap((path) => {
      const content = readFileSync(join(workspace, path), 'utf8')
      return forbidden
        .filter((needle) => content.includes(needle))
        .map((needle) => `${path}: ${needle}`)
    })
    expect(matches).toEqual([])
  })
})
