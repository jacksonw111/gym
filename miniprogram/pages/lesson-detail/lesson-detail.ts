import { createRequestId, getApi, type LessonView } from '../../services/api'

type LessonDetailRow = LessonView & {
  dateLabel: string
  timeLabel: string
}

const decorate = (lesson: LessonView): LessonDetailRow => {
  const startsAt = new Date(lesson.startsAt)
  const endsAt = new Date(lesson.endsAt)
  return {
    ...lesson,
    dateLabel: `${startsAt.getFullYear()} 年 ${startsAt.getMonth() + 1} 月 ${startsAt.getDate()} 日`,
    timeLabel: `${String(startsAt.getHours()).padStart(2, '0')}:00–${String(endsAt.getHours()).padStart(2, '0')}:00`,
  }
}

Page({
  data: {
    lessonId: '',
    lesson: undefined as LessonDetailRow | undefined,
    loading: true,
    error: '',
    submitting: false,
    rating: 0,
    comment: '',
    appealReason: '',
    appealNote: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({ lessonId: query.lessonId ?? '' })
  },

  onShow() {
    void this.load()
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const lesson = await getApi().getLesson(this.data.lessonId)
      this.setData({ loading: false, lesson: decorate(lesson) })
    } catch (error) {
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : '课程详情加载失败',
      })
    }
  },

  selectRating(event: WechatMiniprogram.BaseEvent) {
    this.setData({ rating: Number(event.currentTarget.dataset.rating) })
  },

  updateComment(event: WechatMiniprogram.Input) {
    this.setData({ comment: event.detail.value })
  },

  updateAppealReason(event: WechatMiniprogram.Input) {
    this.setData({ appealReason: event.detail.value })
  },

  updateAppealNote(event: WechatMiniprogram.Input) {
    this.setData({ appealNote: event.detail.value })
  },

  async cancelLesson() {
    if (this.data.submitting || !this.data.lesson?.canCancel) {
      wx.showToast({
        title: this.data.lesson?.cancelHint || '该课程不能取消',
        icon: 'none',
      })
      return
    }
    await this.runAction(
      () =>
        getApi().cancelLesson({
          lessonId: this.data.lessonId,
          requestId: createRequestId('member-cancel'),
        }),
      '课程已取消，课时已释放',
    )
  },

  async completeLesson() {
    if (!this.data.lesson?.canComplete) {
      wx.showToast({ title: '课程结束后才能确认', icon: 'none' })
      return
    }
    await this.runAction(
      () =>
        getApi().completeLesson({
          lessonId: this.data.lessonId,
          requestId: createRequestId('member-complete'),
          ...(this.data.rating >= 1 && this.data.rating <= 5
            ? { rating: this.data.rating as 1 | 2 | 3 | 4 | 5 }
            : {}),
          ...(this.data.comment.trim() ? { comment: this.data.comment.trim() } : {}),
        }),
      '课程已完成',
    )
  },

  async submitAppeal() {
    if (!this.data.appealReason.trim()) {
      wx.showToast({ title: '请填写申诉理由', icon: 'none' })
      return
    }
    await this.runAction(
      () =>
        getApi().submitAppeal({
          lessonId: this.data.lessonId,
          reason: this.data.appealReason,
          note: this.data.appealNote,
          requestId: createRequestId('appeal'),
        }),
      '申诉已提交',
    )
  },

  async runAction(action: () => Promise<unknown>, successMessage: string) {
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
        title: error instanceof Error ? error.message : '操作失败，请重试',
        icon: 'none',
      })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
