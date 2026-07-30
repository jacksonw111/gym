// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest'
import { developmentApi, resetDevelopmentData } from './development'

beforeEach(resetDevelopmentData)

describe('开发数据课时守恒', () => {
  it('通过申诉只把一节 used 退回 available，total 不变且不能重复退款', async () => {
    const before = await developmentApi.loadData()
    const original = before.members[0]?.packages[0]

    await developmentApi.decideAppeal('appeal-240730', 'approve', '核实后退回')
    const afterFirst = await developmentApi.loadData()
    const refunded = afterFirst.members[0]?.packages[0]

    expect(refunded).toMatchObject({
      available: (original?.available ?? 0) + 1,
      used: (original?.used ?? 0) - 1,
      total: original?.total,
    })
    await expect(
      developmentApi.decideAppeal('appeal-240730', 'approve', '重复提交'),
    ).rejects.toThrow('申诉已经处理')
    const afterSecond = await developmentApi.loadData()
    expect(afterSecond.members[0]?.packages[0]).toEqual(refunded)
  })

  it('人工调课保存带原因且不可变的余额变更记录', async () => {
    await developmentApi.adjustPackage('package-chen-advanced', 2, '线下补课')
    const after = await developmentApi.loadData()

    expect(after.members[0]?.packages[0]).toMatchObject({
      available: 8,
      total: 14,
      changes: [
        expect.objectContaining({
          operation: 'manual_adjust',
          availableDelta: 2,
          totalDelta: 2,
          note: '线下补课',
        }),
      ],
    })
    const firstRead = await developmentApi.loadData()
    const record = firstRead.members[0]?.packages[0] as unknown as {
      changes: Array<{ note: string }>
    }
    if (record.changes[0]) record.changes[0].note = '被外部修改'
    const secondRead = await developmentApi.loadData()
    expect(secondRead.members[0]?.packages[0]).toMatchObject({
      changes: [expect.objectContaining({ note: '线下补课' })],
    })
  })
})
