import { describe, expect, it } from 'vitest'
import { phoneNumberFromOpenData } from './phone'

describe('WeChat phone open data', () => {
  it('reads a verified phone number from the first open-data item', () => {
    expect(
      phoneNumberFromOpenData({
        list: [{ data: { phoneNumber: '13800000000', purePhoneNumber: '13800000000' } }],
      }),
    ).toBe('13800000000')
  })

  it('rejects missing or malformed phone open data', () => {
    expect(() => phoneNumberFromOpenData({ list: [] })).toThrow('手机号授权结果无效')
    expect(() =>
      phoneNumberFromOpenData({
        list: [{ data: { purePhoneNumber: 'not-a-phone' } }],
      }),
    ).toThrow('手机号授权结果无效')
  })
})
