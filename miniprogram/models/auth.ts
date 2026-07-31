export type LoginReturn = 'profile' | 'checkout'

export const registrationReady = (avatarPath: string, nickname: string): boolean =>
  Boolean(avatarPath && nickname.trim())

export const isValidMainlandPhone = (phone: string): boolean => /^1[3-9]\d{9}$/.test(phone)

export const normalizePhoneInput = (value: string | number): string =>
  String(value).replace(/\D/g, '').slice(0, 11)

export const registrationInputError = (
  avatarPath: string,
  nickname: string,
  phone?: string,
): string => {
  if (!avatarPath) return '请先选择头像'
  if (!nickname.trim()) return '请填写昵称'
  if (phone !== undefined && !isValidMainlandPhone(phone)) return '请填写正确的 11 位手机号'
  return ''
}

export const shouldUseManualPhone = (platform: string): boolean => platform === 'devtools'

export const loginPageUrl = (returnTo: LoginReturn): string =>
  `/pages/member-login/member-login?returnTo=${returnTo}`
