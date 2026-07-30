import { describe, expect, it } from 'vitest'
import { LatestRequestGate } from '../../miniprogram/models/latest-request'

describe('dated page request ordering', () => {
  it('does not let an older date response replace the latest selected date', async () => {
    const gate = new LatestRequestGate()
    const applied: string[] = []
    let resolveOld: (value: string) => void = () => undefined
    let resolveNew: (value: string) => void = () => undefined
    const oldResponse = new Promise<string>((resolve) => {
      resolveOld = resolve
    })
    const newResponse = new Promise<string>((resolve) => {
      resolveNew = resolve
    })
    const load = async (date: string, response: Promise<string>): Promise<void> => {
      const request = gate.begin(date)
      const value = await response
      if (gate.isCurrent(request, date)) {
        applied.push(value)
      }
    }

    const oldLoad = load('2026-08-01', oldResponse)
    const newLoad = load('2026-08-02', newResponse)
    resolveNew('new date')
    await newLoad
    resolveOld('old date')
    await oldLoad

    expect(applied).toEqual(['new date'])
  })
})
