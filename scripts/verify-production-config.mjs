import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const miniConfigPath = resolve(workspace, 'miniprogram/config/emas.local.js')
const secretsPath = resolve(workspace, 'emas/secrets.local.json')
const adminEnvPath = resolve(workspace, 'admin/.env.local')
const missing = []
const adminEnv = existsSync(adminEnvPath)
  ? Object.fromEntries(
      readFileSync(adminEnvPath, 'utf8')
        .split(/\r?\n/)
        .filter((line) => line.includes('='))
        .map((line) => {
          const separator = line.indexOf('=')
          return [line.slice(0, separator), line.slice(separator + 1)]
        }),
    )
  : {}

if (!existsSync(miniConfigPath)) {
  missing.push('miniprogram/config/emas.local.js')
}
if (!existsSync(secretsPath)) {
  missing.push('emas/secrets.local.json')
}
if (!(process.env.VITE_EMAS_ADMIN_API_URL ?? adminEnv.VITE_EMAS_ADMIN_API_URL)?.trim()) {
  missing.push('VITE_EMAS_ADMIN_API_URL')
}

if (missing.length === 0) {
  const mini = require(miniConfigPath)
  const secrets = JSON.parse(readFileSync(secretsPath, 'utf8'))
  for (const key of ['appId', 'spaceId', 'clientSecret', 'endpoint']) {
    if (!String(mini[key] ?? '').trim()) missing.push(`小程序 ${key}`)
  }
  for (const key of [
    'wechatAppId',
    'wechatAppSecret',
    'adminAllowedOrigin',
    'paymentCreateEndpoint',
    'paymentVerifyEndpoint',
    'paymentApiToken',
  ]) {
    if (!String(secrets[key] ?? '').trim()) missing.push(`服务端 ${key}`)
  }
  if (secrets.production !== true) missing.push('服务端 production=true')
  if (secrets.developmentPaymentsEnabled === true) {
    missing.push('服务端 developmentPaymentsEnabled=false')
  }
}

if (process.env.VITE_ADMIN_DEVELOPMENT === 'true') {
  missing.push('VITE_ADMIN_DEVELOPMENT=false')
}

if (missing.length > 0) {
  console.error(`缺少或不符合正式环境配置：${missing.join('、')}`)
  process.exit(1)
}

console.log('EMAS 正式环境配置检查通过')
