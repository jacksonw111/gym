import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(join(process.cwd(), 'admin/src/styles.css'), 'utf8')

describe('后台字体体系', () => {
  it('使用语义字号、字体平滑和等宽数字', () => {
    expect(styles).toContain('--text-body:')
    expect(styles).toContain('--text-label:')
    expect(styles).toContain('-webkit-font-smoothing: antialiased')
    expect(styles).toContain('font-variant-numeric: tabular-nums')
  })
})
