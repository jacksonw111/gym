import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const SDK = require('@alicloud/mpserverless20190615')
const OpenApi = require('@alicloud/openapi-client')
const workspace = resolve(import.meta.dirname, '..')
const miniConfig = require(resolve(workspace, 'miniprogram/config/emas.local.js'))
const manifest = JSON.parse(
  readFileSync(resolve(workspace, 'emas/database.json'), 'utf8'),
)

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

const runCommand = async (body) => {
  const response = await client.runDBCommand(
    new SDK.RunDBCommandRequest({ spaceId: miniConfig.spaceId, body }),
  )
  return response.body?.result
}

const errorText = (error) =>
  String(error?.data?.errorMessage ?? error?.message ?? error)

const ensureCollection = async (name) => {
  try {
    await runCommand(`db.createCollection("${name}")`)
    console.log(`Created collection: ${name}`)
    return
  } catch (error) {
    if (/already exist|NamespaceExists|已存在/i.test(errorText(error))) {
      console.log(`Collection exists: ${name}`)
      return
    }
    // createCollection 不被命令接口支持时退回写入触发自动建表
    try {
      await runCommand(`db.${name}.insertOne({ _id: "__ensure__" })`)
      await runCommand(`db.${name}.deleteOne({ _id: "__ensure__" })`)
      console.log(`Created collection via write: ${name}`)
    } catch (fallbackError) {
      throw new Error(
        `无法创建集合 ${name}：${errorText(error)} / ${errorText(fallbackError)}`,
      )
    }
  }
}

const ensureIndex = async (collectionName, index) => {
  const keys = JSON.stringify(
    Object.fromEntries(index.fields.map((field) => [field, 1])),
  )
  const options = JSON.stringify({
    name: index.name,
    ...(index.unique ? { unique: true } : {}),
    ...(index.sparse ? { sparse: true } : {}),
  })
  const create = () =>
    runCommand(`db.${collectionName}.createIndex(${keys}, ${options})`)
  try {
    await create()
    console.log(`Ensured index: ${collectionName}.${index.name}`)
  } catch (error) {
    const message = errorText(error)
    if (!/conflict|already exists with a different name|different options/i.test(message)) {
      console.warn(`跳过索引 ${collectionName}.${index.name}: ${message}`)
      return
    }
    // 同名索引配置不同：删除后按清单重建
    try {
      await runCommand(`db.${collectionName}.dropIndex("${index.name}")`)
      await create()
      console.log(`Recreated index: ${collectionName}.${index.name}`)
    } catch (recreateError) {
      console.warn(
        `索引 ${collectionName}.${index.name} 需要在控制台手动调整: ${errorText(recreateError)}`,
      )
    }
  }
}

for (const collection of manifest.collections) {
  await ensureCollection(collection.name)
  for (const index of collection.indexes ?? []) {
    await ensureIndex(collection.name, index)
  }
}
console.log('EMAS database sync complete')
