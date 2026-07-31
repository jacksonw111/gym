import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EMAS_COLLECTIONS } from '../../server/gym/store-emas'

const workspace = process.cwd()

interface DatabaseManifest {
  collections: Array<{
    name: string
    clientPermissions: { read: boolean; write: boolean }
    indexes: Array<{ fields: string[]; unique?: boolean }>
  }>
}

describe('EMAS deployment configuration', () => {
  it('declares every server collection with denied client access', () => {
    const manifest = JSON.parse(
      readFileSync(join(workspace, 'emas/database.json'), 'utf8'),
    ) as DatabaseManifest
    expect(manifest.collections.map((item) => item.name).sort()).toEqual(
      Object.values(EMAS_COLLECTIONS).sort(),
    )
    expect(
      manifest.collections.every(
        (item) => item.clientPermissions.read === false && item.clientPermissions.write === false,
      ),
    ).toBe(true)
  })

  it('declares unique identities, booking slots, requests and admin sessions', () => {
    const manifest = JSON.parse(
      readFileSync(join(workspace, 'emas/database.json'), 'utf8'),
    ) as DatabaseManifest
    const uniqueFields = Object.fromEntries(
      manifest.collections.map((collection) => [
        collection.name,
        collection.indexes.filter((index) => index.unique).flatMap((index) => index.fields),
      ]),
    )
    expect(uniqueFields.users).toContain('emasUserId')
    expect(uniqueFields.booking_locks).toContain('slotKey')
    expect(uniqueFields.operations).toContain('requestId')
    expect(uniqueFields.admin_sessions).toContain('token')
  })

  it('contains all uploadable function packages and the build command', () => {
    const packageJson = JSON.parse(readFileSync(join(workspace, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    const deployScript = readFileSync(join(workspace, 'scripts/deploy-emas.mjs'), 'utf8')
    for (const name of [
      'gym-api',
      'gym-admin-api',
      'auto-complete-lessons',
      'wechat-payment-notify',
      'seed',
    ]) {
      expect(
        readFileSync(join(workspace, `emas/functions/${name}/package.json`), 'utf8'),
      ).toContain(`"name": "${name}"`)
    }
    expect(packageJson.scripts['emas:build']).toBe('node scripts/build-emas.mjs')
    expect(packageJson.scripts['emas:deploy']).toBe('node scripts/deploy-emas.mjs')
    expect(deployScript).toContain("'Content-Type': 'application/octet-stream'")
    expect(deployScript).toContain('VITE_EMAS_ADMIN_API_URL')
    expect(deployScript).toContain('getWebHostingUploadCredential')
    expect(deployScript).toContain("indexPath: 'index.html'")
  })

  it('keeps real EMAS and seed credentials outside tracked files', () => {
    const tracked = execFileSync('git', ['ls-files'], {
      cwd: workspace,
      encoding: 'utf8',
    }).split('\n')
    expect(tracked).not.toContain('miniprogram/config/emas.local.js')
    expect(tracked).not.toContain('emas/secrets.local.json')
    expect(tracked).not.toContain('emas/seed.local.json')
  })
})
