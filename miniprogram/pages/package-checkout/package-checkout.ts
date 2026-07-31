import { getEnvironment } from '../../config/env'
import { loginPageUrl } from '../../models/auth'
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
    pendingOrderId: '',
    purchaseRequestId: '',
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
    if (this.data.pendingOrderId) {
      wx.showToast({ title: '当前订单正在确认，请先查询结果', icon: 'none' })
      return
    }
    const productId = event.currentTarget.dataset.id as string
    const product = this.data.products.find((item) => item.id === productId)
    this.setData({
      selectedProductId: productId,
      ...(product?.coachId ? { selectedCoachId: product.coachId } : {}),
    })
  },

  selectCoach(event: WechatMiniprogram.BaseEvent) {
    if (this.data.pendingOrderId) {
      wx.showToast({ title: '当前订单正在确认，请先查询结果', icon: 'none' })
      return
    }
    const product = this.data.products.find((item) => item.id === this.data.selectedProductId)
    if (product?.coachId && product.coachId !== (event.currentTarget.dataset.id as string)) {
      wx.showToast({ title: '该课包已绑定教练，不能更换', icon: 'none' })
      return
    }
    this.setData({ selectedCoachId: event.currentTarget.dataset.id as string })
  },

  async submit() {
    if (this.data.submitting) {
      wx.showToast({ title: '正在处理，请勿重复提交', icon: 'none' })
      return
    }
    if (!this.data.pendingOrderId && (!this.data.selectedProductId || !this.data.selectedCoachId)) {
      wx.showToast({ title: '请选择课包和教练', icon: 'none' })
      return
    }
    try {
      const session = await getApi().getSession()
      if (!session.authenticated) {
        wx.navigateTo({ url: loginPageUrl('checkout') })
        return
      }
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '登录状态读取失败',
        icon: 'none',
      })
      return
    }
    const requestId = this.data.purchaseRequestId || createRequestId('purchase')
    if (!this.data.purchaseRequestId) {
      this.setData({ purchaseRequestId: requestId })
    }
    this.setData({ submitting: true })
    try {
      const result = this.data.pendingOrderId
        ? await getApi().queryPurchase({
            orderId: this.data.pendingOrderId,
            requestId,
          })
        : await getApi().purchasePackage({
            productId: this.data.selectedProductId,
            coachId: this.data.selectedCoachId,
            requestId,
          })
      if (result.status === 'pending') {
        this.setData({
          pendingOrderId: result.orderId,
          purchaseRequestId: result.requestId,
        })
        wx.showToast({ title: '支付结果确认中，可稍后查询', icon: 'none' })
        return
      }
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
