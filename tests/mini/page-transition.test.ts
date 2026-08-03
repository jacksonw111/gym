import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8')

describe('小程序页面过渡', () => {
  it('复用 Bean Eater 的 div 结构与三组动画，不使用 SVG', () => {
    const markup = read('miniprogram/components/app-tab-bar/app-tab-bar.wxml')
    const styles = read('miniprogram/components/app-tab-bar/app-tab-bar.less')
    const behavior = read('miniprogram/components/app-tab-bar/app-tab-bar.ts')

    expect(markup.match(/class="bean-eater__pellet"/g)).toHaveLength(3)
    expect(markup.match(/class="bean-eater__mouth"/g)).toHaveLength(3)
    expect(markup).not.toContain('<svg')
    expect(styles).toContain('@keyframes bean-eater-mouth-top')
    expect(styles).toContain('@keyframes bean-eater-mouth-bottom')
    expect(styles).toContain('@keyframes bean-eater-pellet')
    expect(behavior).toContain('const SWITCH_DELAY_MS = 400')
  })
})
