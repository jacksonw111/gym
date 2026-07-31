import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'

const workspace = resolve(import.meta.dirname, '..')
const artifactsRoot = join(workspace, 'artifacts/emas')
const functionsRoot = join(artifactsRoot, 'functions')
const stagingRoot = join(artifactsRoot, 'staging')

const functions = [
  'gym-api',
  'gym-admin-api',
  'auto-complete-lessons',
  'wechat-payment-notify',
  'seed',
]

const fallbackConfigs = new Set()

const pickConfig = (localName, exampleName) => {
  const localPath = join(workspace, 'emas', localName)
  if (existsSync(localPath)) return localPath
  fallbackConfigs.add(localName)
  return join(workspace, 'emas', exampleName)
}

rmSync(artifactsRoot, { recursive: true, force: true })
mkdirSync(functionsRoot, { recursive: true })
mkdirSync(stagingRoot, { recursive: true })

for (const name of functions) {
  const stage = join(stagingRoot, name)
  mkdirSync(stage, { recursive: true })
  await build({
    entryPoints: [join(workspace, `emas/functions/${name}/src/index.ts`)],
    outfile: join(stage, 'index.js'),
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    external: ['./secrets.json', './seed.json'],
    footer: { js: 'module.exports = module.exports.main;' },
  })
  copyFileSync(
    join(workspace, `emas/functions/${name}/package.json`),
    join(stage, 'package.json'),
  )
  if (['gym-api', 'gym-admin-api', 'wechat-payment-notify'].includes(name)) {
    copyFileSync(
      pickConfig('secrets.local.json', 'secrets.example.json'),
      join(stage, 'secrets.json'),
    )
  }
  if (name === 'seed') {
    copyFileSync(
      pickConfig('seed.local.json', 'seed.example.json'),
      join(stage, 'seed.json'),
    )
  }
  execFileSync('zip', ['-q', '-r', join(functionsRoot, `${name}.zip`), '.'], {
    cwd: stage,
  })
}

execFileSync('npm', ['run', 'admin:build'], {
  cwd: workspace,
  env: {
    ...process.env,
    VITE_EMAS_ADMIN_API_URL:
      process.env.VITE_EMAS_ADMIN_API_URL ??
      'https://replace-after-function-deploy.invalid/gym-admin-api',
  },
  stdio: 'inherit',
})

console.log(`EMAS function packages: ${functionsRoot}`)
console.log(`Admin static files: ${join(workspace, 'admin/dist')}`)
if (fallbackConfigs.size > 0) {
  console.warn(
    `Configuration required before upload: ${Array.from(fallbackConfigs).join(', ')}`,
  )
}
