import { formatShanghaiDate } from '../../models/time-display'
import { getApi } from '../../services/api'
import { markLoggedOut } from '../../services/session'

const today = (): string => formatShanghaiDate(new Date())

Page({
  data: {
    loading: true,
    error: '',
    name: '',
    bio: '',
    phone: '',
    dualRole: false,
    todayLessons: 0,
    switching: false,
  },

  onShow() {
    void this.load()
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const [session, dashboard] = await Promise.all([
        getApi().getSession(),
        getApi().getCoachDashboard(today()),
      ])
      if (!session.authenticated) throw new Error('请先登录')
      this.setData({
        loading: false,
        name: dashboard.coach.name,
        bio: dashboard.coach.bio ?? '',
        phone: dashboard.coach.phone ?? '未填写',
        dualRole: session.user.roles.includes('member'),
        todayLessons: dashboard.lessons.length,
      })
    } catch (error) {
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : '资料加载失败',
      })
    }
  },

  async switchToMember() {
    if (this.data.switching) {
      return
    }
    this.setData({ switching: true })
    try {
      await getApi().switchRole('member')
      wx.redirectTo({ url: '/pages/member-home/member-home' })
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
    wx.redirectTo({ url: '/pages/member-home/member-home' })
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
