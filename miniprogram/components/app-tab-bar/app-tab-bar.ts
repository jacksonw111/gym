const tabs = {
  member: [
    { key: 'home', label: '首页', mark: 'P', url: '/pages/member-home/member-home' },
    { key: 'lessons', label: '课程', mark: '训', url: '/pages/member-lessons/member-lessons' },
    { key: 'profile', label: '我的', mark: '我', url: '/pages/member-profile/member-profile' },
  ],
  coach: [
    {
      key: 'dashboard',
      label: '工作台',
      mark: '今',
      url: '/pages/coach-dashboard/coach-dashboard',
    },
    { key: 'schedule', label: '排班', mark: '时', url: '/pages/coach-schedule/coach-schedule' },
    { key: 'profile', label: '我的', mark: '我', url: '/pages/coach-profile/coach-profile' },
  ],
}

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
