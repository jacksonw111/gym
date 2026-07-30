import { describe, expect, it } from 'vitest'
import {
  formatShanghaiDate,
  formatShanghaiHourRange,
  getShanghaiDateParts,
} from '../../miniprogram/models/time-display'

describe('Asia/Shanghai display time', () => {
  it('uses UTC+8 even when the timestamp crosses a UTC date boundary', () => {
    expect(getShanghaiDateParts('2026-08-01T16:30:00Z')).toMatchObject({
      year: 2026,
      month: 8,
      day: 2,
      hour: 0,
      minute: 30,
    })
    expect(formatShanghaiDate('2026-08-01T16:30:00Z')).toBe('2026-08-02')
  })

  it('formats lesson hour ranges from absolute timestamps', () => {
    expect(formatShanghaiHourRange('2026-08-01T02:00:00Z', '2026-08-01T03:00:00Z')).toBe(
      '10:00–11:00',
    )
  })
})
