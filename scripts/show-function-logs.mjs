import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const SDK = require('@alicloud/mpserverless20190615')
const OpenApi = require('@alicloud/openapi-client')
const workspace = resolve(import.meta.dirname, '..')
const miniConfig = require(resolve(workspace, 'miniprogram/config/emas.local.js'))

if (!process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || !process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET) {
  throw new Error('请先配置 ALIBABA_CLOUD_ACCESS_KEY_ID 和 ALIBABA_CLOUD_ACCESS_KEY_SECRET')
}
if (!miniConfig.spaceId) throw new Error('小程序 EMAS Space ID 未配置')

const client = new SDK.default(
  new OpenApi.Config({
    accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
    endpoint: 'mpserverless.aliyuncs.com',
    regionId: 'cn-shanghai',
  }),
)

const names = process.argv.slice(2)
const functionNames = names.length > 0 ? names : ['gym-api', 'gym-admin-api']

for (const name of functionNames) {
  const response = await client.listFunctionLog(
    new SDK.ListFunctionLogRequest({
      spaceId: miniConfig.spaceId,
      name,
      pageNum: 1,
      pageSize: 10,
      fromDate: Date.now() - 60 * 60 * 1000,
      toDate: Date.now(),
    }),
  )
  console.log(`===== ${name} =====`)
  // 只输出 ERROR 级别日志；入参日志可能包含密码、手机号等敏感信息，禁止打印
  for (const entry of response.body?.dataList ?? []) {
    for (const [index, content] of (entry.contents ?? []).entries()) {
      const level = entry.levels?.[index] ?? ''
      if (!/error/i.test(level) && !content.includes('internal error')) continue
      console.log(`[${entry.timestamps?.[index] ?? ''}] ${content}`)
    }
  }
}
