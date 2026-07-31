import { describe, expect, it, vi } from 'vitest'
import { createWechatPhoneResolver } from './wechat-phone'

describe('createWechatPhoneResolver', () => {
  it('exchanges a one-time code for a verified phone number', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        data: { access_token: 'access-token', expires_in: 7200 },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: { errcode: 0, phone_info: { phoneNumber: '13800000000' } },
      })
    const resolvePhoneNumber = createWechatPhoneResolver(
      { request },
      { appId: 'wx-app-id', appSecret: 'wx-app-secret' },
    )

    await expect(resolvePhoneNumber('phone-code')).resolves.toBe('13800000000')
    expect(request).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        'grant_type=client_credential&appid=wx-app-id&secret=wx-app-secret',
      ),
      { method: 'GET', dataType: 'json' },
    )
    expect(request).toHaveBeenNthCalledWith(
      2,
      'https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=access-token',
      {
        method: 'POST',
        data: { code: 'phone-code' },
        contentType: 'json',
        dataType: 'json',
      },
    )
  })

  it('reuses a valid access token without requesting it again', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        data: { access_token: 'access-token', expires_in: 7200 },
      })
      .mockResolvedValue({
        status: 200,
        data: { errcode: 0, phone_info: { phoneNumber: '13900000000' } },
      })
    const resolvePhoneNumber = createWechatPhoneResolver(
      { request },
      { appId: 'wx-app-id', appSecret: 'wx-app-secret' },
    )

    await resolvePhoneNumber('first-code')
    await resolvePhoneNumber('second-code')

    expect(request).toHaveBeenCalledTimes(3)
  })

  it('rejects an unsuccessful WeChat response without exposing secrets', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        data: { access_token: 'access-token', expires_in: 7200 },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: { errcode: 40029, errmsg: 'invalid code' },
      })
    const resolvePhoneNumber = createWechatPhoneResolver(
      { request },
      { appId: 'wx-app-id', appSecret: 'wx-app-secret' },
    )

    await expect(resolvePhoneNumber('invalid-code')).rejects.toThrow('手机号授权失败，请重试')
  })
})
