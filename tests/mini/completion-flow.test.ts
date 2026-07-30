import { describe, expect, it, vi } from 'vitest'
import { completeThenSaveFeedback } from '../../miniprogram/models/completion-flow'

describe('member completion workflow', () => {
  it('refreshes the completed lesson before attempting optional feedback', async () => {
    const events: string[] = []
    const result = await completeThenSaveFeedback({
      complete: async () => {
        events.push('complete')
      },
      refreshCompleted: async () => {
        events.push('refresh')
      },
      saveFeedback: async () => {
        events.push('feedback')
        throw new Error('network')
      },
    })

    expect(events).toEqual(['complete', 'refresh', 'feedback'])
    expect(result).toEqual({ completed: true, feedbackSaved: false })
  })

  it('skips the feedback call when no feedback was entered', async () => {
    const saveFeedback = vi.fn()
    const result = await completeThenSaveFeedback({
      complete: vi.fn(),
      refreshCompleted: vi.fn(),
      saveFeedback,
      hasFeedback: false,
    })

    expect(saveFeedback).not.toHaveBeenCalled()
    expect(result).toEqual({ completed: true, feedbackSaved: true })
  })
})
