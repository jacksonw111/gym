import type { CoachScheduleSlot } from '../../models/coach'
import { LatestRequestGate } from '../../models/latest-request'
import { formatShanghaiDate, getShanghaiDateParts } from '../../models/time-display'
import { createRequestId, getApi } from '../../services/api'

interface DateOption {
  date: string
  label: string
  day: string
}

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000
const scheduleRequests = new LatestRequestGate()

const dates = (): DateOption[] => {
  const weekday = ['日', '一', '二', '三', '四', '五', '六']
  const now = Date.now()
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now + index * DAY_MILLISECONDS)
    const parts = getShanghaiDateParts(date)
    return {
      date: formatShanghaiDate(date),
      label: index === 0 ? '今天' : `周${weekday[parts.weekday]}`,
      day: String(parts.day),
    }
  })
}

Page({
  data: {
    dates: [] as DateOption[],
    selectedDate: '',
    slots: [] as CoachScheduleSlot[],
    loading: true,
    error: '',
    submitting: false,
  },

  onLoad() {
    const options = dates()
    this.setData({ dates: options, selectedDate: options[0]?.date ?? '' })
  },

  onShow() {
    void this.load()
  },

  async load() {
    const date = this.data.selectedDate
    const request = scheduleRequests.begin(date)
    this.setData({ loading: true, error: '' })
    try {
      const result = await getApi().getOwnCoachSchedule(date)
      if (!scheduleRequests.isCurrent(request, this.data.selectedDate)) {
        return
      }
      this.setData({ loading: false, slots: result.slots })
    } catch (error) {
      if (!scheduleRequests.isCurrent(request, this.data.selectedDate)) {
        return
      }
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : '排班加载失败',
      })
    }
  },

  selectDate(event: WechatMiniprogram.BaseEvent) {
    this.setData({ selectedDate: event.currentTarget.dataset.date as string })
    void this.load()
  },

  async openAll() {
    await this.setDay(true)
  },

  async closeAll() {
    await this.setDay(false)
  },

  async setDay(open: boolean) {
    if (this.data.submitting) {
      wx.showToast({ title: '正在处理，请勿重复提交', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      const result = await getApi().setCoachDayAvailability({
        date: this.data.selectedDate,
        open,
        requestId: createRequestId('schedule-day'),
      })
      wx.showToast({
        title: result.skippedBooked
          ? `已处理，跳过 ${result.skippedBooked} 个预约`
          : open
            ? '已全部开放'
            : '已全部关闭',
        icon: 'none',
      })
      await this.load()
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '排班更新失败',
        icon: 'none',
      })
    } finally {
      this.setData({ submitting: false })
    }
  },

  async toggleSlot(event: WechatMiniprogram.BaseEvent) {
    if (this.data.submitting) {
      wx.showToast({ title: '正在处理，请勿重复提交', icon: 'none' })
      return
    }
    const startsAt = event.currentTarget.dataset.starts as string
    const slot = this.data.slots.find((candidate) => candidate.startsAt === startsAt)
    if (!slot) {
      return
    }
    if (slot.locked) {
      wx.showToast({ title: '已有预约，请先处理预约', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      const result = await getApi().setCoachSlotAvailability({
        date: this.data.selectedDate,
        startsAt,
        open: !slot.open,
        requestId: createRequestId('schedule-slot'),
      })
      this.setData({ slots: result.slots })
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '时段更新失败',
        icon: 'none',
      })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
