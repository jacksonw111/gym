import { buildMemberHomeModel, formatPrice } from '../../models/member'
import { formatShanghaiHour, getShanghaiDateParts } from '../../models/time-display'
import { getApi } from '../../services/api'
import type { Coach, Lesson, MembershipPackage, PackageProduct } from '../../shared/contracts'

interface PackageRow extends MembershipPackage {
  coachName: string
  price: string
}

interface ProductRow extends PackageProduct {
  price: string
}

interface CoachRow extends Coach {
  monogram: string
}

interface NextLessonRow {
  id: string
  coachName: string
  time: string
}

Page({
  data: {
    loading: true,
    error: '',
    userName: '',
    products: [] as ProductRow[],
    coaches: [] as CoachRow[],
    memberships: [] as PackageRow[],
    totalAvailable: 0,
    nextLesson: undefined as NextLessonRow | undefined,
  },

  onShow() {
    void this.load()
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const api = getApi()
      const [session, result] = await Promise.all([api.getSession(), api.getMemberHome()])
      if (session.authenticated && session.role === 'coach') {
        wx.redirectTo({ url: '/pages/coach-dashboard/coach-dashboard' })
        return
      }
      const model = buildMemberHomeModel(result.memberships, result.lessons, new Date())
      const coachName = (coachId: string): string =>
        result.coaches.find((coach) => coach.id === coachId)?.name ?? '教练'
      this.setData({
        loading: false,
        userName: result.user?.name ?? '',
        products: result.products.map((product) => ({
          ...product,
          price: formatPrice(product.priceCents),
        })),
        coaches: result.coaches.map((coach) => ({
          ...coach,
          monogram: coach.name.charAt(0),
        })),
        memberships: model.packages.map((membership) => ({
          ...membership,
          coachName: coachName(membership.coachId),
        })),
        totalAvailable: model.totalAvailableLessons,
        nextLesson: model.nextLesson
          ? this.toNextLesson(model.nextLesson, result.coaches)
          : undefined,
      })
    } catch (error) {
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : '加载失败，请稍后重试',
      })
    }
  },

  toNextLesson(lesson: Lesson, coaches: Coach[]): NextLessonRow {
    const startsAt = getShanghaiDateParts(lesson.startsAt)
    return {
      id: lesson.id,
      coachName: coaches.find((coach) => coach.id === lesson.coachId)?.name ?? '教练',
      time: `${startsAt.month} 月 ${startsAt.day} 日 ${formatShanghaiHour(lesson.startsAt)}`,
    }
  },

  openCheckout() {
    wx.navigateTo({ url: '/pages/package-checkout/package-checkout' })
  },

  openCoach(event: WechatMiniprogram.BaseEvent) {
    const coachId = event.currentTarget.dataset.id as string
    wx.navigateTo({ url: `/pages/coach-detail/coach-detail?coachId=${coachId}` })
  },

  openLesson(event: WechatMiniprogram.BaseEvent) {
    const lessonId = event.currentTarget.dataset.id as string
    wx.navigateTo({ url: `/pages/lesson-detail/lesson-detail?lessonId=${lessonId}` })
  },
})
