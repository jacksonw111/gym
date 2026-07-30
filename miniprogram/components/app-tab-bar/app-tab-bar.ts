import { tabs } from '../../models/navigation'

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
  },

  observers: {
    role(role: 'member' | 'coach') {
      this.setData({ tabs: tabs[role] })
    },
  },

  methods: {
    navigate(event: WechatMiniprogram.BaseEvent) {
      const url = event.currentTarget.dataset.url as string
      wx.redirectTo({ url })
    },
  },
})
