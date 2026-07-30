export type LoginReturn = 'profile' | 'checkout'

export const registrationReady = (avatarPath: string, nickname: string): boolean =>
  Boolean(avatarPath && nickname.trim())

export const loginPageUrl = (returnTo: LoginReturn): string =>
  `/pages/member-login/member-login?returnTo=${returnTo}`
