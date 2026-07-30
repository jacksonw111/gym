import { getEnvironment } from '../../config/env'
import { formatPrice } from '../../models/member'
import { createRequestId, getApi } from '../../services/api'
import type { Coach, PackageProduct } from '../../shared/contracts'

interface ProductOption extends PackageProduct {
  price: string
}

interface CoachOption extends Coach {
  monogram: string
}

Page({
  data: {
    loading: true,
    error: '',
    products: [] as ProductOption[],
    coaches: [] as CoachOption[],
    selectedProductId: '',
    selectedCoachId: '',
    submitting: false,
    testPayment: false,
  },

  onLoad() {
    this.setData({ testPayment: getEnvironment().testPaymentEnabled })
    void this.load()
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const result = await getApi().getMemberHome()
      this.setData({
        loading: false,
        products: result.products.map((product) => ({
          ...product,
          price: formatPrice(product.priceCents),
        })),
        coaches: result.coaches
          .filter((coach) => coach.status === 'active')
          .map((coach) => ({ ...coach, monogram: coach.name.charAt(0) })),
      })
    } catch (error) {
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : '加载失败',
      })
    }
  },

  selectProduct(event: WechatMiniprogram.BaseEvent) {
    this.setData({ selectedProductId: event.currentTarget.dataset.id as string })
  },

  selectCoach(event: WechatMiniprogram.BaseEvent) {
    this.setData({ selectedCoachId: event.currentTarget.dataset.id as string })
  },

  async submit() {
    if (this.data.submitting) {
      wx.showToast({ title: '正在处理，请勿重复提交', icon: 'none' })
      return
    }
    if (!this.data.selectedProductId || !this.data.selectedCoachId) {
      wx.showToast({ title: '请选择课包和教练', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      await getApi().purchasePackage({
        productId: this.data.selectedProductId,
        coachId: this.data.selectedCoachId,
        requestId: createRequestId('purchase'),
      })
      wx.showToast({
        title: this.data.testPayment ? '测试购买成功' : '支付成功',
        icon: 'success',
      })
      setTimeout(() => wx.navigateBack(), 700)
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '购买未完成',
        icon: 'none',
      })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
