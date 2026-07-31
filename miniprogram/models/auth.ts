export type LoginReturn = 'profile' | 'checkout'

export const registrationReady = (avatarPath: string, nickname: string): boolean =>
  Boolean(avatarPath && nickname.trim())

export const isValidMainlandPhone = (phone: string): boolean => /^1[3-9]\d{9}$/.test(phone)

export const shouldUseManualPhone = (platform: string): boolean => platform === 'devtools'

export const loginPageUrl = (returnTo: LoginReturn): string =>
  `/pages/member-login/member-login?returnTo=${returnTo}`
