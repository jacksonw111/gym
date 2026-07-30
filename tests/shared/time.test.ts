import { describe, expect, it } from 'vitest'
import {
  canMemberCancel,
  canSubmitAppeal,
  createDefaultSlots,
} from '../../miniprogram/shared/time'

describe('lesson time rules', () => {
  it('creates eleven one-hour slots from 10:00 through 21:00', () => {
    const slots = createDefaultSlots('2026-08-01')
    expect(slots).toHaveLength(11)
    expect(slots.at(0)).toEqual({
      startsAt: '2026-08-01T10:00:00+08:00',
      endsAt: '2026-08-01T11:00:00+08:00',
      label: '10:00–11:00',
    })
    expect(slots.at(-1)).toEqual({
      startsAt: '2026-08-01T20:00:00+08:00',
      endsAt: '2026-08-01T21:00:00+08:00',
      label: '20:00–21:00',
    })
  })

  it('allows member cancellation at exactly two hours but not one minute later', () => {
    const startsAt = new Date('2026-08-01T10:00:00+08:00')
    expect(canMemberCancel(startsAt, new Date('2026-08-01T08:00:00+08:00'))).toBe(true)
    expect(canMemberCancel(startsAt, new Date('2026-08-01T08:01:00+08:00'))).toBe(false)
  })

  it('accepts an appeal through the seventh day only', () => {
    const consumedAt = new Date('2026-08-01T10:00:00+08:00')
    expect(canSubmitAppeal(consumedAt, new Date('2026-08-01T10:00:00+08:00'))).toBe(true)
    expect(canSubmitAppeal(consumedAt, new Date('2026-08-08T10:00:00+08:00'))).toBe(true)
    expect(canSubmitAppeal(consumedAt, new Date('2026-08-08T10:00:01+08:00'))).toBe(false)
    expect(canSubmitAppeal(consumedAt, new Date('2026-08-01T09:59:59+08:00'))).toBe(false)
  })
})
