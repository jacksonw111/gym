import { describe, expect, it } from 'vitest'
import { hasRole } from '../../miniprogram/shared/contracts'
import type { User } from '../../miniprogram/shared/contracts'

describe('user roles', () => {
  it('expresses a dual-role account without a special dual role', () => {
    const user: User = {
      id: 'dual-role-user',
      openId: 'dual-role-open-id',
      name: '双身份用户',
      roles: ['member', 'coach'],
    }

    expect(hasRole(user, 'member')).toBe(true)
    expect(hasRole(user, 'coach')).toBe(true)
  })
})
