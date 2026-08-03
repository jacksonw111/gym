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
const commands = [
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
  ...collections.flatMap(({ collectionName, createIndexes = [] }) =>
    createIndexes.length
      ? [
          {
            TableName: collectionName,
            CommandType: 'COMMAND',
            Command: JSON.stringify({
              createIndexes: collectionName,
              indexes: createIndexes.map(({ name, keys, unique = false, sparse = false }) => ({
                name,
                key: Object.fromEntries(keys.map((key) => [key.name, key.direction])),
                unique,
                ...(sparse ? { sparse: true } : {}),
              })),
            }),
          },
        ]
      : [],
  ),
]

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
  { stdio: 'inherit' },
)

if (result.error) throw result.error
process.exitCode = result.status ?? 1
