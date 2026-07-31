import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspace = join(import.meta.dirname, '../..')

describe('cloud provider boundary', () => {
  it('keeps the shared gym domain outside Tencent cloud function folders', () => {
    expect(existsSync(join(workspace, 'server/gym/index.ts'))).toBe(true)
    expect(existsSync(join(workspace, 'cloudfunctions/gym-api/src/index.ts'))).toBe(false)
  })
})
