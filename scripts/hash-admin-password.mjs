import { createHash } from 'node:crypto'

const password = process.argv[2]
if (!password) {
  console.error('用法：node scripts/hash-admin-password.mjs <管理员密码>')
  process.exit(1)
}

console.log(createHash('sha256').update(password).digest('hex'))
