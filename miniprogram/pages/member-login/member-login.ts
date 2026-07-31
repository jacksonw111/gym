import {
  type LoginReturn,
  normalizePhoneInput,
  registrationInputError,
  shouldUseManualPhone,
} from '../../models/auth'
import { createRequestId, getApi } from '../../services/api'

interface ChooseAvatarEvent extends WechatMiniprogram.BaseEvent {
  detail: { avatarUrl: string }
}

interface NicknameInputEvent extends WechatMiniprogram.BaseEvent {
  detail: { value: string }
}

interface ManualLoginEvent extends WechatMiniprogram.BaseEvent {
  detail: { value: { phone?: string | number } }
}

interface PhoneNumberEvent extends WechatMiniprogram.BaseEvent {
  detail: { cloudID?: string }
}

Page({
  data: {
    avatarPath: '',
    nickname: '',
    returnTo: 'profile' as LoginReturn,
    manualPhoneMode: false,
    submitting: false,
    error: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({
      returnTo: query.returnTo === 'checkout' ? 'checkout' : 'profile',
      manualPhoneMode: shouldUseManualPhone(wx.getDeviceInfo().platform),
    })
  },

  chooseAvatar(event: ChooseAvatarEvent) {
    const avatarPath = event.detail.avatarUrl
    this.setData({
      avatarPath,
      error: '',
    })
  },

  changeNickname(event: NicknameInputEvent) {
    const nickname = event.detail.value
    this.setData({
      nickname,
      error: '',
    })
  },

  async authorizePhone(event: PhoneNumberEvent) {
    if (this.data.submitting) {
      return
    }
    const inputError = registrationInputError(this.data.avatarPath, this.data.nickname)
    if (inputError) {
      this.setData({ error: inputError })
      return
    }
    const phoneCloudId = event.detail.cloudID
    if (!phoneCloudId) {
      this.setData({
        manualPhoneMode: true,
        error: '未获得微信手机号授权，请手动填写手机号登录。',
      })
      return
    }
    await this.submitRegistration({ phoneCloudId })
  },

  async manualLogin(event: ManualLoginEvent) {
    if (this.data.submitting) {
      return
    }
    const phone = normalizePhoneInput(event.detail.value.phone ?? '')
    const inputError = registrationInputError(this.data.avatarPath, this.data.nickname, phone)
    if (inputError) {
      this.setData({ error: inputError })
      return
    }
    await this.submitRegistration({ phone })
  },

  async submitRegistration(phoneInput: { phoneCloudId?: string; phone?: string }) {
    this.setData({ submitting: true, error: '' })
    try {
      const extension = this.data.avatarPath.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? '.jpg'
      const uploaded = await wx.cloud.uploadFile({
        cloudPath: `avatars/${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extension}`,
        filePath: this.data.avatarPath,
      })
      await getApi().registerMember({
        name: this.data.nickname.trim(),
        avatarUrl: uploaded.fileID,
        ...phoneInput,
        requestId: createRequestId('register'),
      })
      wx.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 500)
    } catch (error) {
      this.setData({
        error: error instanceof Error ? error.message : '登录失败，请重试',
        submitting: false,
      })
    }
  },
})
