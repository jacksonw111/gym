import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const template = readFileSync(
  join(import.meta.dirname, '../../miniprogram/pages/member-login/member-login.wxml'),
  'utf8',
)

describe('member login template', () => {
  it('lets the native WeChat nickname picker own the input value', () => {
    expect(template).toContain('name="nickname"')
    expect(template).toContain('bindblur="changeNickname"')
    expect(template).toContain('bindchange="changeNickname"')
    expect(template).not.toContain('value="{{nickname}}"')
  })
})
