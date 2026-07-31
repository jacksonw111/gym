import { createHash } from 'node:crypto'
import type { StoreSeed } from './store'

export const hashAdminPassword = (password: string): string =>
  createHash('sha256').update(password).digest('hex')

export const createDevelopmentSeed = (): StoreSeed => ({
  users: [
    {
      id: 'member-1',
      emasUserId: 'dev-member-openid',
      name: '示例会员',
      roles: ['member'],
    },
    {
      id: 'coach-user-1',
      emasUserId: 'dev-coach-openid',
      name: '示例教练',
      roles: ['coach'],
    },
  ],
  coaches: [
    {
      id: 'coach-1',
      userId: 'coach-user-1',
      name: '示例教练',
      status: 'active',
    },
  ],
  products: [
    {
      id: 'product-1',
      name: '十节私教课',
      priceCents: 5_000,
      lessonCount: 10,
      status: 'published',
    },
  ],
  schedules: [
    {
      id: 'slot-1',
      coachId: 'coach-1',
      startsAt: '2026-08-01T10:00:00.000Z',
      endsAt: '2026-08-01T11:00:00.000Z',
      open: true,
    },
  ],
  admins: [
    {
      id: 'admin-1',
      username: 'admin',
      passwordHash: hashAdminPassword('dev-admin-password'),
    },
  ],
})
