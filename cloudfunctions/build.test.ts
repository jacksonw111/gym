import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspace = join(import.meta.dirname, '..')
const functionNames = ['gym-api', 'auto-complete-lessons', 'wechat-payment-notify'] as const

describe('CloudBase部署构建', () => {
  it('生产云函数不再调用全量数据加载或全局数据库锁', () => {
    const gymApi = readFileSync(join(workspace, 'cloudfunctions/gym-api/src/index.ts'), 'utf8')
    const paymentNotify = readFileSync(
      join(workspace, 'cloudfunctions/wechat-payment-notify/src/index.ts'),
      'utf8',
    )
    const cloudStore = readFileSync(
      join(workspace, 'cloudfunctions/gym-api/src/store-cloudbase.ts'),
      'utf8',
    )

    expect(gymApi).not.toContain('store.load()')
    expect(paymentNotify).not.toContain('store.load()')
    expect(cloudStore).not.toContain('systemLocks')
    expect(cloudStore).not.toContain('async load(): Promise<void>')
    expect(cloudStore).not.toContain('loadFrom(')
  })

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
        const devtoolsEntry = join(directory, 'index.js')
        const exported = execFileSync(
          process.execPath,
          ['-e', `console.log(typeof require(${JSON.stringify(devtoolsEntry)}).main)`],
          {
            cwd: directory,
            encoding: 'utf8',
          },
        )
        expect(exported.trim()).toBe('function')
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
    ]
    const cloudbase = JSON.parse(readFileSync(join(workspace, 'cloudbaserc.json'), 'utf8')) as {
      framework: {
        plugins: {
          database: {
            inputs: {
              collections: Array<{
                collectionName: string
                createIndexes?: Array<{ name: string }>
              }>
            }
          }
          functions: {
            inputs: {
              functions: Array<{ name: string; config: { handler?: string } }>
            }
          }
          admin: {
            inputs: {
              outputPath: string
              cloudPath: string
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
    const requiredIndexes: Record<string, string[]> = {
      coaches: ['coach_user_unique', 'coach_status'],
      products: ['product_status', 'product_coach'],
      memberships: ['membership_member', 'membership_coach'],
      orders: ['payment_id_unique', 'order_member_request_unique', 'order_status'],
      schedules: ['coach_schedule_unique'],
      lessons: ['coach_starts_unique', 'member_status', 'member_request_unique', 'lesson_status'],
      appeals: ['appeal_status', 'appeal_lesson_unique', 'appeal_member'],
      ledger: ['ledger_package'],
      admins: ['admin_username_unique'],
      adminSessions: ['admin_session_token_unique'],
    }
    const collectionConfigs = new Map(
      cloudbase.framework.plugins.database.inputs.collections.map((item) => [
        item.collectionName,
        item,
      ]),
    )
    for (const [collection, indexes] of Object.entries(requiredIndexes)) {
      expect(collectionConfigs.get(collection)?.createIndexes?.map((item) => item.name)).toEqual(
        expect.arrayContaining(indexes),
      )
    }
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
    expect(cloudbase.framework.plugins.admin.inputs).toMatchObject({
      outputPath: 'admin/dist',
      cloudPath: '/admin',
    })
    expect(readFileSync(join(workspace, 'admin/vite.config.ts'), 'utf8')).toContain(
      "mode === 'production' ? '/admin/' : '/'",
    )
  })
})
