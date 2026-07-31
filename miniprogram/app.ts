import MPServerless from '@alicloud/mpserverless-sdk'
import { getEnvironment } from './config/env'
import { registerApi } from './services/api'
import { DevelopmentApi } from './services/development-api'
import { EmasApi, type EmasClient } from './services/emas-api'

App({
  globalData: {},

  onLaunch() {
    const environment = getEnvironment()

    if (environment.useLocalData) {
      registerApi(new DevelopmentApi())
      return
    }

    const emas = new MPServerless(wx, environment.emas)
    const ready = emas.init()
    registerApi(new EmasApi(emas as unknown as EmasClient, environment.testPaymentEnabled, ready))
  },
})
