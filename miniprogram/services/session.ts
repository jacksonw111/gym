const LOGGED_OUT_KEY = 'purui-gym-logged-out'

interface WechatStorage {
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: unknown): void
  removeStorageSync(key: string): void
}

const wechat = (): WechatStorage => (globalThis as unknown as { wx: WechatStorage }).wx

// 小程序身份来自微信 openid，云端始终能识别已注册用户。
// “退出登录”是本地会话状态：退出后各页面回到游客视图，重新授权登录即可恢复。
export const isLocallyLoggedOut = (): boolean => wechat().getStorageSync(LOGGED_OUT_KEY) === true

export const markLoggedOut = (): void => {
  wechat().setStorageSync(LOGGED_OUT_KEY, true)
}

export const clearLoggedOut = (): void => {
  wechat().removeStorageSync(LOGGED_OUT_KEY)
}
