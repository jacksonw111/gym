import MPServerless from '@alicloud/mpserverless-sdk'
import { getEnvironment } from './config/env'
import { registerApi } from './services/api'
import { DevelopmentApi } from './services/development-api'
import { EmasApi, type EmasApplicationClient, initializeEmasClient } from './services/emas-api'

App({
  globalData: {},

  onLaunch() {
    const environment = getEnvironment()

    if (environment.useLocalData) {
      registerApi(new DevelopmentApi())
      return
    }

    const emas = new MPServerless(wx, environment.emas)
    const client = emas as unknown as EmasApplicationClient
    const ready = initializeEmasClient(client)
    registerApi(new EmasApi(client, environment.testPaymentEnabled, ready))
  },
})
