Page({
  data: {
    showPopup: false,
  },

  openPopup() {
    this.setData({ showPopup: true })
  },

  closePopup() {
    this.setData({ showPopup: false })
  },
})
