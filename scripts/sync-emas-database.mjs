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

// RunDBCommand 的 body 是 JSON 命令对象，例如
// {"command":"createIndex","collection":"places","field":{"location":"2dsphere"},
//  "options":{"name":"location_2dsphere","unique":false}}
const runCommand = async (payload) => {
  const response = await client.runDBCommand(
    new SDK.RunDBCommandRequest({
      spaceId: miniConfig.spaceId,
      body: JSON.stringify(payload),
    }),
  )
  return response.body?.result
}

const errorText = (error) =>
  String(error?.data?.errorMessage ?? error?.message ?? error)

// createIndex 会自动创建不存在的集合，因此集合与索引一并保证
const ensureIndex = async (collectionName, index) => {
  const payload = {
    command: 'createIndex',
    collection: collectionName,
    field: Object.fromEntries(index.fields.map((field) => [field, 1])),
    options: {
      name: index.name,
      unique: index.unique === true,
      ...(index.sparse ? { sparse: true } : {}),
    },
  }
  try {
    await runCommand(payload)
    console.log(`Ensured index: ${collectionName}.${index.name}`)
    return
  } catch (error) {
    const message = errorText(error)
    if (!/conflict|already exists|IndexOptions|IndexKeySpecsConflict/i.test(message)) {
      throw new Error(`无法创建索引 ${collectionName}.${index.name}：${message}`)
    }
    // 同名索引配置不同：删除后按清单重建
    try {
      await runCommand({
        command: 'dropIndex',
        collection: collectionName,
        options: { name: index.name },
      })
      await runCommand(payload)
      console.log(`Recreated index: ${collectionName}.${index.name}`)
    } catch (recreateError) {
      console.warn(
        `索引 ${collectionName}.${index.name} 需要在控制台手动调整: ${errorText(recreateError)}`,
      )
    }
  }
}

for (const collection of manifest.collections) {
  for (const index of collection.indexes ?? []) {
    await ensureIndex(collection.name, index)
  }
}
console.log('EMAS database sync complete')
