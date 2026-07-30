const required = [
  'CLOUDBASE_ENV_ID',
  'VITE_CLOUDBASE_ENV_ID',
  'INTERNAL_SCHEDULER_TOKEN',
  'WECHAT_PAYMENT_CREATE_URL',
  'WECHAT_PAYMENT_VERIFY_URL',
  'WECHAT_PAYMENT_API_TOKEN',
]

const missing = required.filter((name) => !process.env[name]?.trim())
if (missing.length > 0) {
  console.error(`缺少生产环境配置：${missing.join('、')}`)
  process.exit(1)
}

if (process.env.CLOUDBASE_ENV_ID !== process.env.VITE_CLOUDBASE_ENV_ID) {
  console.error('CLOUDBASE_ENV_ID 与 VITE_CLOUDBASE_ENV_ID 必须指向同一个云环境')
  process.exit(1)
}

if (process.env.VITE_ADMIN_DEVELOPMENT === 'true') {
  console.error('生产环境禁止启用后台模拟数据')
  process.exit(1)
}

console.log('生产环境配置检查通过')
