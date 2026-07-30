import { formatShanghaiDate, formatShanghaiHourRange } from '../../models/time-display'
import { createRequestId, getApi, type LessonView } from '../../services/api'

type TimelineLesson = LessonView & {
  timeLabel: string
  isNext: boolean
  hasEnded: boolean
}

const today = (): string => formatShanghaiDate(new Date())

Page({
  data: {
    date: today(),
    coachName: '',
    lessons: [] as TimelineLesson[],
    loading: true,
    error: '',
    selectedLesson: undefined as TimelineLesson | undefined,
    submitting: false,
  },

  onShow() {
    void this.load()
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const result = await getApi().getCoachDashboard(this.data.date)
      const now = Date.now()
      const nextId = result.lessons.find(
        (lesson) => lesson.status === 'booked' && Date.parse(lesson.startsAt) >= now,
      )?.id
      this.setData({
        loading: false,
        coachName: result.coach.name,
        lessons: result.lessons.map((lesson) => {
          const endsAt = new Date(lesson.endsAt)
          return {
            ...lesson,
            timeLabel: formatShanghaiHourRange(lesson.startsAt, lesson.endsAt),
            isNext: lesson.id === nextId,
            hasEnded: endsAt.getTime() <= now,
          }
        }),
      })
    } catch (error) {
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : '工作台加载失败',
      })
    }
  },

  openCancel(event: WechatMiniprogram.BaseEvent) {
    const id = event.currentTarget.dataset.id as string
    this.setData({ selectedLesson: this.data.lessons.find((lesson) => lesson.id === id) })
  },

  closeCancel() {
    if (!this.data.submitting) {
      this.setData({ selectedLesson: undefined })
    }
  },

  async cancelWithoutConsume() {
    await this.cancel(false)
  },

  async cancelWithConsume() {
    await this.cancel(true)
  },

  async cancel(consumeLesson: boolean) {
    const lesson = this.data.selectedLesson
    if (!lesson || this.data.submitting) {
      return
    }
    await this.run(
      () =>
        getApi().coachCancelLesson({
          lessonId: lesson.id,
          consumeLesson,
          requestId: createRequestId('coach-cancel'),
        }),
      consumeLesson ? '已取消并消耗 1 节' : '已取消，课时已释放',
    )
    this.setData({ selectedLesson: undefined })
  },

  async complete(event: WechatMiniprogram.BaseEvent) {
    const lessonId = event.currentTarget.dataset.id as string
    await this.run(
      () =>
        getApi().coachCompleteLesson({
          lessonId,
          requestId: createRequestId('coach-complete'),
        }),
      '课程已完成',
    )
  },

  async run(action: () => Promise<unknown>, successMessage: string) {
    if (this.data.submitting) {
      wx.showToast({ title: '正在处理，请勿重复提交', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      await action()
      wx.showToast({ title: successMessage, icon: 'success' })
      await this.load()
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '操作失败',
        icon: 'none',
      })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
