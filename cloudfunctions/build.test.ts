import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspace = join(import.meta.dirname, '..')
const functionNames = ['gym-api', 'auto-complete-lessons', 'wechat-payment-notify'] as const

describe('CloudBase部署构建', () => {
  it('三个函数都构建为可由Node 18加载的独立dist入口', () => {
    try {
      for (const functionName of functionNames) {
        const directory = join(workspace, 'cloudfunctions', functionName)
        const packageJson = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as {
          main?: string
          scripts?: Record<string, string>
          dependencies?: Record<string, string>
          devDependencies?: Record<string, string>
        }
        expect(packageJson.main).toBe('dist/index.js')
        expect(packageJson.scripts?.build).toContain('esbuild')
        expect(packageJson.scripts?.postinstall).toBeUndefined()
        expect(packageJson.dependencies?.esbuild).toBeUndefined()
        expect(packageJson.devDependencies?.esbuild).toBe('0.28.1')

        execFileSync('npm', ['run', 'build'], { cwd: directory, stdio: 'pipe' })
        const entry = join(directory, 'dist', 'index.js')
        execFileSync(process.execPath, ['-e', `require(${JSON.stringify(entry)})`], {
          cwd: directory,
          stdio: 'pipe',
        })
      }

      const autoSource = readFileSync(
        join(workspace, 'cloudfunctions/auto-complete-lessons/src/index.ts'),
        'utf8',
      )
      expect(autoSource).not.toContain('gym-api/src')
    } finally {
      for (const functionName of functionNames) {
        rmSync(join(workspace, 'cloudfunctions', functionName, 'dist'), {
          recursive: true,
          force: true,
        })
      }
    }
  })

  it('部署配置、规则与运行时集合名称完全一致', () => {
    const expectedCollections = [
      'users',
      'coaches',
      'products',
      'memberships',
      'orders',
      'schedules',
      'lessons',
      'appeals',
      'ledger',
      'admins',
      'adminSessions',
      'system_locks',
    ]
    const cloudbase = JSON.parse(readFileSync(join(workspace, 'cloudbaserc.json'), 'utf8')) as {
      framework: {
        plugins: {
          database: { inputs: { collections: Array<{ collectionName: string }> } }
          functions: {
            inputs: {
              functions: Array<{ name: string; config: { handler?: string } }>
            }
          }
        }
      }
    }
    const rules = JSON.parse(
      readFileSync(join(workspace, 'database.rules.json'), 'utf8'),
    ) as Record<string, unknown>

    expect(
      cloudbase.framework.plugins.database.inputs.collections
        .map((item) => item.collectionName)
        .sort(),
    ).toEqual([...expectedCollections].sort())
    expect(Object.keys(rules).sort()).toEqual([...expectedCollections].sort())
    expect(
      cloudbase.framework.plugins.functions.inputs.functions.map((item) => ({
        name: item.name,
        handler: item.config.handler,
      })),
    ).toEqual([
      { name: 'gym-api', handler: 'dist/index.main' },
      { name: 'auto-complete-lessons', handler: 'dist/index.main' },
      { name: 'wechat-payment-notify', handler: 'dist/index.main' },
    ])
  })
})
