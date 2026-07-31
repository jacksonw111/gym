import { execFileSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { basename, extname, join, relative, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const SDK = require('@alicloud/mpserverless20190615')
const OpenApi = require('@alicloud/openapi-client')
const workspace = resolve(import.meta.dirname, '..')
const miniConfig = require(resolve(workspace, 'miniprogram/config/emas.local.js'))
const secretsPath = resolve(workspace, 'emas/secrets.local.json')
const secrets = existsSync(secretsPath)
  ? JSON.parse(readFileSync(secretsPath, 'utf8'))
  : {}

const definitions = {
  'gym-api': {},
  'gym-admin-api': { httpTriggerPath: '/http/gym-admin-api' },
  'auto-complete-lessons': { timingTriggerConfig: '0 0 * * * *' },
  'wechat-payment-notify': { httpTriggerPath: '/http/wechat-payment-notify' },
  seed: {},
}

const requested = process.argv.slice(2)
const functionNames = requested.length > 0 ? requested : Object.keys(definitions)
for (const name of functionNames) {
  if (!definitions[name]) throw new Error(`未知 EMAS 函数：${name}`)
}

if (!process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || !process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET) {
  throw new Error('请先配置 ALIBABA_CLOUD_ACCESS_KEY_ID 和 ALIBABA_CLOUD_ACCESS_KEY_SECRET')
}
if (!miniConfig.spaceId) throw new Error('小程序 EMAS Space ID 未配置')
if (functionNames.includes('gym-admin-api') && !secrets.adminAllowedOrigin) {
  throw new Error('部署 gym-admin-api 前请配置 adminAllowedOrigin')
}
if (
  functionNames.includes('gym-api') &&
  (!secrets.wechatAppId || !secrets.wechatAppSecret)
) {
  throw new Error('部署 gym-api 前请配置微信 AppID 和 AppSecret')
}
if (
  functionNames.includes('wechat-payment-notify') &&
  (!secrets.paymentVerifyEndpoint || !secrets.paymentApiToken)
) {
  throw new Error('部署支付通知函数前请配置支付验签服务')
}
if (functionNames.includes('seed') && !existsSync(resolve(workspace, 'emas/seed.local.json'))) {
  throw new Error('部署 seed 前请创建 emas/seed.local.json')
}

execFileSync('npm', ['run', 'emas:build'], {
  cwd: workspace,
  env: process.env,
  stdio: 'inherit',
})

const client = new SDK.default(
  new OpenApi.Config({
    accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
    endpoint: 'mpserverless.aliyuncs.com',
    regionId: 'cn-shanghai',
  }),
)

const request = (name, values) => new SDK[name](values)

const saveAdminApiUrl = (adminApiUrl) => {
  const envPath = resolve(workspace, 'admin/.env.local')
  const current = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
  const entry = `VITE_EMAS_ADMIN_API_URL=${adminApiUrl}`
  const next = current.match(/^VITE_EMAS_ADMIN_API_URL=.*$/m)
    ? current.replace(/^VITE_EMAS_ADMIN_API_URL=.*$/m, entry)
    : `${current.trimEnd()}${current.trim() ? '\n' : ''}${entry}\n`
  writeFileSync(envPath, next)
}

const adminContentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

const listFiles = (root, current = root) =>
  readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(current, entry.name)
    if (entry.isDirectory()) return listFiles(root, absolutePath)
    return [
      {
        absolutePath,
        relativePath: relative(root, absolutePath).replaceAll('\\', '/'),
      },
    ]
  })

const uploadAdminFile = async (file) => {
  const webPath = file.relativePath
  const credential = await client.getWebHostingUploadCredential(
    request('GetWebHostingUploadCredentialRequest', {
      spaceId: miniConfig.spaceId,
      filePath: `/${webPath}`,
    }),
  )
  const data = credential.body?.data
  if (
    !data?.accessKeyId ||
    !data.endpoint ||
    !data.filePath ||
    !data.policy ||
    !data.securityToken ||
    !data.signature
  ) {
    throw new Error(`无法取得后台文件上传凭证：${webPath}`)
  }

  const form = new FormData()
  form.append('policy', data.policy)
  form.append('OSSAccessKeyId', data.accessKeyId)
  form.append('success_action_status', '200')
  form.append('signature', data.signature)
  form.append('x-oss-security-token', data.securityToken)
  form.append('key', data.filePath)
  form.append(
    'file',
    new Blob([readFileSync(file.absolutePath)], {
      type: adminContentTypes[extname(file.absolutePath)] ?? 'application/octet-stream',
    }),
    basename(file.absolutePath),
  )

  const endpoint = data.endpoint.startsWith('http')
    ? data.endpoint
    : `https://${data.endpoint}`
  const upload = await fetch(endpoint, { method: 'POST', body: form })
  if (!upload.ok) {
    const response = await upload.text()
    const code = response.match(/<Code>([^<]+)<\/Code>/)?.[1] ?? 'Unknown'
    const message = response.match(/<Message>([^<]+)<\/Message>/)?.[1] ?? '未知原因'
    throw new Error(`后台文件上传失败：${webPath}，HTTP ${upload.status} ${code}: ${message}`)
  }
}

const deployAdminSite = async () => {
  const status = await client.getWebHostingStatus(
    request('GetWebHostingStatusRequest', { spaceId: miniConfig.spaceId }),
  )
  if (status.body?.data?.status !== 'IN_SERVICE') {
    await client.openWebHostingService(
      request('OpenWebHostingServiceRequest', { spaceId: miniConfig.spaceId }),
    )
    throw new Error('静态网站托管正在开通，请等待 3 到 5 分钟后重新运行部署命令')
  }

  const files = listFiles(resolve(workspace, 'admin/dist'))
  for (const file of files) await uploadAdminFile(file)
  await client.modifyWebHostingConfig(
    request('ModifyWebHostingConfigRequest', {
      spaceId: miniConfig.spaceId,
      indexPath: 'index.html',
      errorPath: 'index.html',
      errorHttpStatus: '200',
    }),
  )

  const config = await client.getWebHostingConfig(
    request('GetWebHostingConfigRequest', { spaceId: miniConfig.spaceId }),
  )
  const domain = config.body?.data?.defaultDomain
  if (!domain) throw new Error('后台网页已上传，但未取得静态网站访问地址')
  return domain.startsWith('http') ? domain : `https://${domain}`
}

const functionExists = async (name) => {
  try {
    await client.describeFunction(
      request('DescribeFunctionRequest', { spaceId: miniConfig.spaceId, name }),
    )
    return true
  } catch (error) {
    if (error?.code === 'InvalidFunctionName.NotFound') return false
    throw error
  }
}

const ensureFunction = async (name) => {
  if (await functionExists(name)) return
  await client.createFunction(
    request('CreateFunctionRequest', {
      spaceId: miniConfig.spaceId,
      name,
      runtime: 'nodejs20',
      memory: 512,
      timeout: name === 'auto-complete-lessons' ? 300 : 60,
      desc: '普瑞健身 EMAS Serverless',
    }),
  )
  console.log(`Created function: ${name}`)
}

const uploadDeployment = async (name) => {
  const deployment = await client.createFunctionDeployment(
    request('CreateFunctionDeploymentRequest', {
      spaceId: miniConfig.spaceId,
      name,
    }),
  )
  const deploymentId = deployment.body?.deploymentId
  const uploadSignedUrl = deployment.body?.uploadSignedUrl
  if (!deploymentId || !uploadSignedUrl) {
    throw new Error(`无法为 ${name} 创建部署单`)
  }

  const zip = readFileSync(
    resolve(workspace, `artifacts/emas/functions/${name}.zip`),
  )
  const uploadUrl = new URL(uploadSignedUrl)
  console.log(
    `Uploading ${name}: ${uploadUrl.protocol}//${uploadUrl.host}${uploadUrl.pathname.endsWith('.zip') ? '/*.zip' : '/*'}`,
  )
  const upload = await fetch(uploadSignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: zip,
    redirect: 'manual',
  })
  if (!upload.ok) {
    const response = await upload.text()
    const readField = (field) =>
      response.match(new RegExp(`<${field}>([^<]+)</${field}>`))?.[1]
    const code = readField('Code') ?? 'Unknown'
    const message = readField('Message') ?? '未知原因'
    const requestId = readField('RequestId')
    throw new Error(
      `${name} 代码包上传失败：HTTP ${upload.status} ${code}: ${message}${requestId ? ` (${requestId})` : ''}`,
    )
  }

  await client.deployFunction(
    request('DeployFunctionRequest', {
      spaceId: miniConfig.spaceId,
      deploymentId,
    }),
  )
  return deploymentId
}

const configureFunction = async (name) => {
  const definition = definitions[name]
  if (!definition.httpTriggerPath && !definition.timingTriggerConfig) return
  await client.updateFunction(
    request('UpdateFunctionRequest', {
      spaceId: miniConfig.spaceId,
      name,
      ...definition,
    }),
  )
}

if (functionNames.some((name) => definitions[name].httpTriggerPath)) {
  const current = await client.describeHttpTriggerConfig(
    request('DescribeHttpTriggerConfigRequest', { spaceId: miniConfig.spaceId }),
  )
  if (!current.body?.enableService) {
    await client.updateHttpTriggerConfig(
      request('UpdateHttpTriggerConfigRequest', {
        spaceId: miniConfig.spaceId,
        enableService: true,
      }),
    )
    console.log('Enabled HTTP triggers for the EMAS space')
  }
}

for (const name of functionNames) {
  await ensureFunction(name)
  const deploymentId = await uploadDeployment(name)
  await configureFunction(name)
  console.log(`Deployed function: ${name} (${deploymentId})`)
}

if (functionNames.includes('gym-admin-api')) {
  const domain = new URL(secrets.adminAllowedOrigin).host
  const cors = await client.listCorsDomains(
    request('ListCorsDomainsRequest', { spaceId: miniConfig.spaceId }),
  )
  if (!cors.body?.domains?.some((item) => item.domain === domain)) {
    await client.addCorsDomain(
      request('AddCorsDomainRequest', {
        spaceId: miniConfig.spaceId,
        domain,
      }),
    )
    console.log(`Added CORS domain: ${domain}`)
  }
}

const httpConfig = await client.describeHttpTriggerConfig(
  request('DescribeHttpTriggerConfigRequest', { spaceId: miniConfig.spaceId }),
)
const endpoint = httpConfig.body?.defaultEndpoint
if (endpoint) {
  const baseUrl = endpoint.startsWith('http') ? endpoint : `https://${endpoint}`
  for (const name of functionNames) {
    const path = definitions[name].httpTriggerPath
    if (!path) continue
    const functionUrl = `${baseUrl.replace(/\/$/, '')}${path}`
    console.log(`${name} URL: ${functionUrl}`)
    if (name === 'gym-admin-api') {
      saveAdminApiUrl(functionUrl)
      execFileSync('npm', ['run', 'admin:build'], {
        cwd: workspace,
        env: {
          ...process.env,
          VITE_ADMIN_DEVELOPMENT: 'false',
          VITE_EMAS_ADMIN_API_URL: functionUrl,
        },
        stdio: 'inherit',
      })
      console.log('Saved the admin API URL and rebuilt the admin site')
      const adminSiteUrl = await deployAdminSite()
      console.log(`Admin site URL: ${adminSiteUrl}`)
    }
  }
}
