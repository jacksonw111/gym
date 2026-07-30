import { formatShanghaiHourRange, getShanghaiDateParts } from '../../models/time-display'
import type { LessonView } from '../../services/api'
import { getApi } from '../../services/api'

type LessonRow = LessonView & {
  dateLabel: string
  timeLabel: string
}

interface HistoryGroup {
  month: string
  lessons: LessonRow[]
}

const toRow = (lesson: LessonView): LessonRow => {
  const startsAt = getShanghaiDateParts(lesson.startsAt)
  return {
    ...lesson,
    dateLabel: `${startsAt.month} 月 ${startsAt.day} 日`,
    timeLabel: formatShanghaiHourRange(lesson.startsAt, lesson.endsAt),
  }
}

Page({
  data: {
    tab: 'upcoming' as 'upcoming' | 'history',
    upcoming: [] as LessonRow[],
    historyGroups: [] as HistoryGroup[],
    loading: true,
    error: '',
  },

  onShow() {
    void this.load()
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const result = await getApi().listMemberLessons()
      const groups = new Map<string, LessonRow[]>()
      for (const lesson of result.history.map(toRow)) {
        const startsAt = getShanghaiDateParts(lesson.startsAt)
        const month = `${startsAt.year} 年 ${startsAt.month} 月`
        groups.set(month, [...(groups.get(month) ?? []), lesson])
      }
      this.setData({
        loading: false,
        upcoming: result.upcoming.map(toRow),
        historyGroups: Array.from(groups, ([month, lessons]) => ({ month, lessons })),
      })
    } catch (error) {
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : '课程加载失败',
      })
    }
  },

  switchTab(event: WechatMiniprogram.BaseEvent) {
    this.setData({ tab: event.currentTarget.dataset.tab as 'upcoming' | 'history' })
  },

  openLesson(event: WechatMiniprogram.BaseEvent) {
    const lessonId = event.currentTarget.dataset.id as string
    wx.navigateTo({ url: `/pages/lesson-detail/lesson-detail?lessonId=${lessonId}` })
  },
})
