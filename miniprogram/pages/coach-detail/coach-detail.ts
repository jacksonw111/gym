import { LatestRequestGate } from '../../models/latest-request'
import { availablePackagesForCoach, buildPublicSlot } from '../../models/member'
import { formatShanghaiDate, getShanghaiDateParts } from '../../models/time-display'
import { createRequestId, getApi } from '../../services/api'
import type { MembershipPackage } from '../../shared/contracts'

interface DateOption {
  date: string
  day: string
  weekday: string
}

interface SlotRow {
  startsAt: string
  endsAt: string
  status: 'available' | 'occupied' | 'mine' | 'closed'
  label: string
  time: string
}

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000
const scheduleRequests = new LatestRequestGate()

const weekDates = (): DateOption[] => {
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const now = Date.now()
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now + index * DAY_MILLISECONDS)
    const parts = getShanghaiDateParts(date)
    return {
      date: formatShanghaiDate(date),
      day: String(parts.day),
      weekday: index === 0 ? '今天' : (weekdays[parts.weekday] ?? ''),
    }
  })
}

Page({
  data: {
    coachId: '',
    coachName: '',
    coachBio: '',
    dates: [] as DateOption[],
    selectedDate: '',
    slots: [] as SlotRow[],
    memberships: [] as MembershipPackage[],
    selectedSlot: undefined as SlotRow | undefined,
    selectedMembershipId: '',
    loading: true,
    error: '',
    submitting: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    const dates = weekDates()
    this.setData({
      coachId: query.coachId ?? '',
      dates,
      selectedDate: dates[0]?.date ?? '',
    })
    void this.load()
  },

  async load() {
    const date = this.data.selectedDate
    const request = scheduleRequests.begin(date)
    this.setData({ loading: true, error: '' })
    try {
      const api = getApi()
      const [session, home, schedule] = await Promise.all([
        api.getSession(),
        api.getMemberHome(),
        api.getCoachSchedule(this.data.coachId, date),
      ])
      if (!scheduleRequests.isCurrent(request, this.data.selectedDate)) {
        return
      }
      const memberships = availablePackagesForCoach(home.memberships, this.data.coachId)
      this.setData({
        loading: false,
        coachName: schedule.coach.name,
        coachBio: schedule.coach.bio ?? '',
        memberships,
        selectedMembershipId: memberships[0]?.id ?? '',
        slots: schedule.slots.map((slot) => ({
          ...buildPublicSlot({
            ...slot,
            viewerMemberId: session.authenticated ? session.user.id : '',
          }),
          time: slot.label,
        })),
      })
    } catch (error) {
      if (!scheduleRequests.isCurrent(request, this.data.selectedDate)) {
        return
      }
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : '课程表加载失败',
      })
    }
  },

  chooseDate(event: WechatMiniprogram.BaseEvent) {
    this.setData({
      selectedDate: event.currentTarget.dataset.date as string,
      selectedSlot: undefined,
    })
    void this.load()
  },

  chooseSlot(event: WechatMiniprogram.BaseEvent) {
    const startsAt = event.currentTarget.dataset.starts as string
    const slot = this.data.slots.find((candidate) => candidate.startsAt === startsAt)
    if (slot?.status !== 'available') {
      wx.showToast({ title: slot?.label ?? '该时段不可预约', icon: 'none' })
      return
    }
    if (!this.data.memberships.length) {
      wx.showToast({ title: '没有绑定当前教练的可用课包', icon: 'none' })
      return
    }
    this.setData({ selectedSlot: slot })
  },

  chooseMembership(event: WechatMiniprogram.BaseEvent) {
    this.setData({ selectedMembershipId: event.currentTarget.dataset.id as string })
  },

  closePanel() {
    if (!this.data.submitting) {
      this.setData({ selectedSlot: undefined })
    }
  },

  async confirmBooking() {
    if (this.data.submitting) {
      wx.showToast({ title: '正在预约，请勿重复提交', icon: 'none' })
      return
    }
    const slot = this.data.selectedSlot
    if (!slot || !this.data.selectedMembershipId) {
      return
    }
    this.setData({ submitting: true })
    try {
      await getApi().bookLesson({
        coachId: this.data.coachId,
        membershipPackageId: this.data.selectedMembershipId,
        startsAt: slot.startsAt,
        requestId: createRequestId('booking'),
      })
      wx.showToast({ title: '预约成功', icon: 'success' })
      this.setData({ selectedSlot: undefined })
      await this.load()
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '预约失败，请重试',
        icon: 'none',
      })
      await this.load()
    } finally {
      this.setData({ submitting: false })
    }
  },
})
