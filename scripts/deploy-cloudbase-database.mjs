import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const envArgumentIndex = process.argv.indexOf('--env')
const envId =
  process.env.CLOUDBASE_ENV_ID ||
  (envArgumentIndex >= 0 ? process.argv[envArgumentIndex + 1] : undefined)
if (!envId || envId.startsWith('--')) {
  throw new Error('请通过 CLOUDBASE_ENV_ID 或 --env 指定云环境')
}

const config = JSON.parse(readFileSync(new URL('../cloudbaserc.json', import.meta.url), 'utf8'))
const collections = config.framework.plugins.database.inputs.collections

const indexFor = ({ name, keys, unique = false, sparse = false }) => ({
  name,
  key: Object.fromEntries(keys.map((key) => [key.name, key.direction])),
  unique,
  ...(sparse ? { sparse: true } : {}),
})

const tcb = (commands) => {
  const result = spawnSync(
    'npx',
    [
      '-p',
      '@cloudbase/cli@3.7.0',
      'tcb',
      '-e',
      envId,
      'db',
      'nosql',
      'execute',
      '--json',
      '--command',
      JSON.stringify(commands),
    ],
    { encoding: 'utf8' },
  )
  if (result.error) throw result.error
  return { ok: result.status === 0, stdout: (result.stdout ?? '').trim() }
}

const createIndexCommand = (collectionName, index) => ({
  TableName: collectionName,
  CommandType: 'COMMAND',
  Command: JSON.stringify({ createIndexes: collectionName, indexes: [index] }),
})

const dropIndex = (collectionName, indexName, spec) => {
  const attempts = [
    // 与 createIndexes 一致的完整索引配置格式（已确认 createIndexes 用此格式）
    { dropIndexes: collectionName, indexes: [spec] },
    // MongoDB 风格：单数 index + 索引名
    { dropIndexes: collectionName, index: indexName },
  ]
  let lastOutput = ''
  for (const command of attempts) {
    const result = tcb([
      {
        TableName: collectionName,
        CommandType: 'COMMAND',
        Command: JSON.stringify(command),
      },
    ])
    if (result.ok) return result
    lastOutput = result.stdout
  }
  throw new Error(`删除索引 ${collectionName}.${indexName} 失败：${lastOutput}`)
}

const ensureIndex = (collectionName, rawIndex) => {
  const spec = indexFor(rawIndex)
  const first = tcb([createIndexCommand(collectionName, spec)])
  if (first.ok) {
    console.log(`  已就绪 ${collectionName}.${spec.name}`)
    return
  }
  let message = first.stdout
  try {
    message = JSON.parse(first.stdout).error?.message ?? message
  } catch {
    // 保留原始输出
  }
  if (!message.includes('already exists')) {
    throw new Error(`创建索引 ${collectionName}.${spec.name} 失败：${message}`)
  }
  console.log(`  索引 ${collectionName}.${spec.name} 已存在且配置不同，先读取云端现状再删除重建…`)
  // 诊断：列出云端该集合的真实索引，避免盲改
  const listed = tcb([
    {
      TableName: collectionName,
      CommandType: 'COMMAND',
      Command: JSON.stringify({ listIndexes: collectionName }),
    },
  ])
  if (listed.ok) console.log(`  云端现状：${listed.stdout}`)
  else console.log(`  listIndexes 不可用：${listed.stdout}`)
  dropIndex(collectionName, spec.name, spec)
  const retry = tcb([createIndexCommand(collectionName, spec)])
  if (!retry.ok) {
    throw new Error(`重建索引 ${collectionName}.${spec.name} 失败：${retry.stdout}`)
  }
  console.log(`  已重建 ${collectionName}.${spec.name}`)
}

console.log('更新 products 状态兜底数据…')
const backfill = tcb([
  {
    TableName: 'products',
    CommandType: 'UPDATE',
    Command: JSON.stringify({
      update: 'products',
      updates: [
        {
          q: { status: { $nin: ['published', 'unpublished'] } },
          u: { $set: { status: 'unpublished' } },
          multi: true,
        },
      ],
    }),
  },
])
if (!backfill.ok) {
  throw new Error(`products 状态兜底更新失败：${backfill.stdout}`)
}

for (const { collectionName, createIndexes = [] } of collections) {
  for (const index of createIndexes) {
    ensureIndex(collectionName, indexFor(index))
  }
}

console.log('数据库索引部署完成')
