import { getCloudInitializationOptions, getEnvironment } from './config/env'
import { registerApi } from './services/api'
import { CloudApi } from './services/cloud-api'
import { DevelopmentApi } from './services/development-api'

App({
  globalData: {},

  onLaunch() {
    const environment = getEnvironment()

    if (!environment.useLocalData) {
      wx.cloud.init(getCloudInitializationOptions(environment))
      registerApi(new CloudApi())
      return
    }

    registerApi(new DevelopmentApi())
  },
})
