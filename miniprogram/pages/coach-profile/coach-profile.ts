import { formatShanghaiDate } from '../../models/time-display'
import { getApi } from '../../services/api'

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
})
