import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspace = join(import.meta.dirname, '../..')
const pageSource = (name: string): string =>
  readFileSync(join(workspace, 'miniprogram/pages', name, `${name}.ts`), 'utf8')

describe('小程序页面查询次数', () => {
  it.each(['member-home', 'member-lessons', 'coach-detail', 'coach-profile'])(
    '%s 不再单独查询会话',
    (page) => {
      expect(pageSource(page)).not.toContain('getSession()')
    },
  )

  it('教练详情只调用一次组合课程表接口', () => {
    const source = pageSource('coach-detail')
    expect(source).not.toContain('getMemberHome()')
    expect(source.match(/getCoachSchedule\(/g)).toHaveLength(1)
  })
})
