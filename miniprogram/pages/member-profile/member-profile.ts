import { loginPageUrl } from '../../models/auth'
import { getApi } from '../../services/api'
import { markLoggedOut } from '../../services/session'
import type { MembershipPackage } from '../../shared/contracts'

Page({
  data: {
    loading: true,
    error: '',
    authenticated: false,
    avatarUrl: '',
    name: '',
    phone: '',
    dualRole: false,
    memberships: [] as MembershipPackage[],
    totalAvailable: 0,
    switching: false,
  },

  onShow() {
    void this.load()
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const result = await getApi().getMemberHome()
      const user = result.user
      this.setData({
        loading: false,
        authenticated: result.authenticated,
        avatarUrl: user?.avatarUrl ?? '',
        name: user?.name ?? '',
        phone: user?.phone ?? '未填写',
        dualRole: user?.roles.includes('coach') ?? false,
        memberships: result.memberships,
        totalAvailable: result.memberships.reduce(
          (total, membership) => total + membership.availableLessons,
          0,
        ),
      })
    } catch (error) {
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : '资料加载失败',
      })
    }
  },

  login() {
    wx.navigateTo({ url: loginPageUrl('profile') })
  },

  async switchToCoach() {
    if (this.data.switching) {
      return
    }
    this.setData({ switching: true })
    try {
      await getApi().switchRole('coach')
      wx.redirectTo({ url: '/pages/coach-dashboard/coach-dashboard' })
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '身份切换失败',
        icon: 'none',
      })
      this.setData({ switching: false })
    }
  },

  async logout() {
    const confirmed = await this.confirmLogout()
    if (!confirmed) {
      return
    }
    markLoggedOut()
    await this.load()
  },

  confirmLogout(): Promise<boolean> {
    return wx
      .showModal({
        title: '退出登录',
        content: '退出后将以游客身份浏览，仍可随时重新登录。',
        confirmText: '退出',
        confirmColor: '#b32720',
      })
      .then((result) => result.confirm)
      .catch(() => false)
  },
})
