import { getApi } from '../../services/api'
import type { MembershipPackage } from '../../shared/contracts'

Page({
  data: {
    loading: true,
    error: '',
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
})
