import { tabs } from '../../models/navigation'

const SWITCH_DELAY_MS = 400

Component({
  properties: {
    role: {
      type: String,
      value: 'member',
    },
    current: {
      type: String,
      value: 'home',
    },
  },

  data: {
    tabs: tabs.member,
    switching: false,
    switchingLabel: '',
  },

  observers: {
    role(role: 'member' | 'coach') {
      this.setData({ tabs: tabs[role] })
    },
  },

  methods: {
    navigate(event: WechatMiniprogram.BaseEvent) {
      if (this.data.switching) {
        return
      }
      const url = event.currentTarget.dataset.url as string
      const label = event.currentTarget.dataset.label as string
      this.setData({ switching: true, switchingLabel: label })
      setTimeout(() => {
        wx.redirectTo({
          url,
          fail: () => {
            this.setData({ switching: false, switchingLabel: '' })
            wx.showToast({ title: '页面切换失败，请重试', icon: 'none' })
          },
        })
      }, SWITCH_DELAY_MS)
    },
  },
})
