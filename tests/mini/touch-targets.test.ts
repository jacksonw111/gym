import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8')

const expectMinimumTouchHeight = (styles: string, selector: string): void => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  expect(styles).toMatch(
    new RegExp(`${escapedSelector}\\s*\\{[^}]*min-height:\\s*(?:8[8-9]|9\\d|[1-9]\\d{2,})rpx`, 's'),
  )
}

describe('mini program touch targets', () => {
  it('keeps primary interactive surfaces at least 88rpx high', () => {
    expectMinimumTouchHeight(
      read('miniprogram/pages/coach-schedule/coach-schedule.less'),
      '.switch',
    )
    expectMinimumTouchHeight(read('miniprogram/pages/member-lessons/member-lessons.less'), '.tab')
    expectMinimumTouchHeight(read('miniprogram/pages/lesson-detail/lesson-detail.less'), '.star')
    expectMinimumTouchHeight(
      read('miniprogram/pages/coach-detail/coach-detail.less'),
      '.package-choice',
    )
    expectMinimumTouchHeight(
      read('miniprogram/pages/coach-detail/coach-detail.less'),
      '.booking-panel__close',
    )
    expectMinimumTouchHeight(
      read('miniprogram/pages/coach-dashboard/coach-dashboard.less'),
      '.timeline-item__actions button',
    )
    expectMinimumTouchHeight(
      read('miniprogram/pages/coach-dashboard/coach-dashboard.less'),
      '.cancel-panel__close',
    )
  })

  it('renders continue purchase as a secondary button-sized control', () => {
    const markup = read('miniprogram/pages/member-home/member-home.wxml')
    const styles = read('miniprogram/pages/member-home/member-home.less')

    expect(markup).toMatch(/<button[^>]*class="section-link"[^>]*bindtap="openCheckout"/s)
    expectMinimumTouchHeight(styles, '.section-link')
    expect(styles).toMatch(/\.section-link\s*\{[^}]*padding:\s*0\s+\d+rpx/s)
  })
})
