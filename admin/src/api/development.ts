import type {
  AdminApi,
  AdminData,
  Appeal,
  CoachInput,
  CoachStatus,
  ProductInput,
  ProductStatus,
} from './types'

const DATA_KEY = 'purui-admin-data'
const SESSION_KEY = 'purui-admin-session'

const seedData = (): AdminData => ({
  coaches: [
    {
      id: 'coach-linxiao',
      userId: 'coach-user-linxiao',
      name: '林骁',
      phone: '138 0013 8001',
      specialty: '力量训练 · 运动表现',
      status: 'active',
      schedule: [
        { date: '2026-07-30', time: '10:00–11:00', member: '陈澄', course: '私教进阶课' },
        { date: '2026-07-30', time: '16:00–17:00', member: '沈舟', course: '基础力量课' },
      ],
      history: [
        { date: '2026-07-30', member: '陈澄', status: '已完成' },
        { date: '2026-07-26', member: '陈澄', status: '教练取消（已扣课）' },
      ],
    },
    {
      id: 'coach-zhoulan',
      userId: 'coach-user-zhoulan',
      name: '周岚',
      phone: '138 0013 8002',
      specialty: '体态改善 · 康复训练',
      status: 'active',
      schedule: [{ date: '2026-07-31', time: '09:00–10:00', member: '许妍', course: '体态评估课' }],
      history: [{ date: '2026-07-19', member: '许妍', status: '已完成' }],
    },
    {
      id: 'coach-jiangyu',
      userId: 'coach-user-jiangyu',
      name: '江屿',
      phone: '138 0013 8003',
      specialty: '减脂塑形 · 拳击',
      status: 'inactive',
      schedule: [],
      history: [],
    },
  ],
  members: [
    {
      id: 'member-chencheng',
      name: '陈澄',
      phone: '186 1068 2231',
      joinedAt: '2026-03-12',
      packages: [
        {
          id: 'package-chen-advanced',
          productName: '12 节私教进阶包',
          coachId: 'coach-linxiao',
          coachName: '林骁',
          available: 6,
          locked: 1,
          used: 5,
          total: 12,
          purchasedAt: '2026-06-18',
          changes: [],
        },
      ],
      courseHistory: [
        { date: '2026-07-29', course: '私教进阶课', coach: '林骁', status: '已完成' },
        { date: '2026-07-26', course: '私教进阶课', coach: '林骁', status: '教练取消（扣课）' },
      ],
      orders: [
        {
          id: 'O-260618',
          productSnapshot: '12 节私教进阶包 · ¥4,680 · 12 节',
          amount: 4680,
          paidAt: '2026-06-18',
        },
      ],
      feedback: [{ course: '私教进阶课', rating: 5, comment: '动作纠正很细致。' }],
      appealIds: ['appeal-240730'],
    },
    {
      id: 'member-shenzhou',
      name: '沈舟',
      phone: '139 1180 4472',
      joinedAt: '2026-05-08',
      packages: [
        {
          id: 'package-shen-basic',
          productName: '8 节私教基础包',
          coachId: 'coach-linxiao',
          coachName: '林骁',
          available: 5,
          locked: 1,
          used: 2,
          total: 8,
          purchasedAt: '2026-05-08',
          changes: [],
        },
      ],
      courseHistory: [
        { date: '2026-07-23', course: '基础力量课', coach: '林骁', status: '已完成' },
      ],
      orders: [
        {
          id: 'O-260508',
          productSnapshot: '8 节私教基础包 · ¥3,280 · 8 节',
          amount: 3280,
          paidAt: '2026-05-08',
        },
      ],
      feedback: [],
      appealIds: [],
    },
    {
      id: 'member-xuyan',
      name: '许妍',
      phone: '177 2219 5068',
      joinedAt: '2026-07-03',
      packages: [
        {
          id: 'package-xu-posture',
          productName: '6 节体态改善包',
          coachId: 'coach-zhoulan',
          coachName: '周岚',
          available: 4,
          locked: 1,
          used: 1,
          total: 6,
          purchasedAt: '2026-07-03',
          changes: [],
        },
      ],
      courseHistory: [
        { date: '2026-07-19', course: '体态改善课', coach: '周岚', status: '已完成' },
      ],
      orders: [
        {
          id: 'O-260703',
          productSnapshot: '6 节体态改善包 · ¥2,880 · 6 节',
          amount: 2880,
          paidAt: '2026-07-03',
        },
      ],
      feedback: [{ course: '体态改善课', rating: 4, comment: '肩颈轻松了很多。' }],
      appealIds: [],
    },
  ],
  products: [
    {
      id: 'product-advanced',
      name: '12 节私教进阶包',
      price: 4680,
      lessons: 12,
      status: 'published',
      soldCount: 34,
    },
    {
      id: 'product-basic',
      name: '8 节私教基础包',
      price: 3280,
      lessons: 8,
      status: 'published',
      soldCount: 52,
    },
    {
      id: 'product-posture',
      name: '6 节体态改善包',
      price: 2880,
      lessons: 6,
      status: 'unpublished',
      soldCount: 18,
    },
  ],
  bookings: [
    {
      id: 'lesson-0730-completed',
      date: '2026-07-30',
      time: '10:00–11:00',
      coachId: 'coach-linxiao',
      coachName: '林骁',
      memberId: 'member-chencheng',
      memberName: '陈澄',
      status: 'completed',
      packageName: '12 节私教进阶包',
      source: '会员确认完成',
      timeline: [
        { at: '07-28 11:20', label: '预约成功', source: '会员端' },
        { at: '07-30 11:05', label: '课程完成', source: '会员确认' },
      ],
      ledger: [
        {
          id: 'change-completed-lock',
          at: '07-28 11:20',
          operation: '锁定课时',
          delta: -1,
          description: '可用 -1 / 锁定 +1',
        },
        {
          id: 'change-completed-consume',
          at: '07-30 11:05',
          operation: '核销课时',
          delta: 0,
          description: '锁定 -1 / 已用 +1',
        },
      ],
      feedback: {
        rating: 5,
        comment: '动作纠正很细致。',
        submittedAt: '2026-07-30 11:12',
      },
    },
    {
      id: 'lesson-0730-booked',
      date: '2026-07-30',
      time: '16:00–17:00',
      coachId: 'coach-linxiao',
      coachName: '林骁',
      memberId: 'member-shenzhou',
      memberName: '沈舟',
      status: 'booked',
      packageName: '8 节私教基础包',
      source: '会员预约',
      timeline: [{ at: '07-29 09:40', label: '预约成功', source: '会员端' }],
      ledger: [
        {
          id: 'change-booked-lock',
          at: '07-29 09:40',
          operation: '锁定课时',
          delta: -1,
          description: '可用 -1 / 锁定 +1',
        },
      ],
    },
    {
      id: 'lesson-0731-booked',
      date: '2026-07-31',
      time: '09:00–10:00',
      coachId: 'coach-zhoulan',
      coachName: '周岚',
      memberId: 'member-xuyan',
      memberName: '许妍',
      status: 'booked',
      packageName: '6 节体态改善包',
      source: '会员预约',
      timeline: [{ at: '07-29 14:10', label: '预约成功', source: '会员端' }],
      ledger: [
        {
          id: 'change-posture-lock',
          at: '07-29 14:10',
          operation: '锁定课时',
          delta: -1,
          description: '可用 -1 / 锁定 +1',
        },
      ],
    },
    {
      id: 'lesson-appealed',
      date: '2026-07-26',
      time: '15:00–16:00',
      coachId: 'coach-linxiao',
      coachName: '林骁',
      memberId: 'member-chencheng',
      memberName: '陈澄',
      status: 'coach_cancelled_consumed',
      packageName: '12 节私教进阶包',
      source: '教练取消 · 已扣课',
      timeline: [
        { at: '07-24 18:20', label: '预约成功', source: '会员端' },
        { at: '07-26 13:12', label: '教练取消并扣课', source: '教练端' },
      ],
      ledger: [
        {
          id: 'change-appealed-lock',
          at: '07-24 18:20',
          operation: '锁定课时',
          delta: -1,
          description: '可用 -1 / 锁定 +1',
        },
        {
          id: 'change-appealed-consume',
          at: '07-26 13:12',
          operation: '核销课时',
          delta: 0,
          description: '锁定 -1 / 已用 +1',
        },
      ],
    },
  ],
  appeals: [
    {
      id: 'appeal-240730',
      lessonId: 'lesson-appealed',
      memberId: 'member-chencheng',
      memberName: '陈澄',
      coachName: '林骁',
      courseAt: '2026-07-26 15:00–16:00',
      packageId: 'package-chen-advanced',
      reason: '教练临时取消，但系统仍扣除了课时。',
      note: '当天 13:12 收到取消消息，没有实际到馆上课。',
      status: 'pending',
      createdAt: '2026-07-30 09:18',
      source: '教练取消 · 已扣课',
      balanceChanges: [
        {
          id: 'change-appealed-lock',
          at: '07-24 18:20',
          operation: '锁定课时',
          delta: -1,
          description: '可用 -1 / 锁定 +1',
        },
        {
          id: 'change-appealed-consume',
          at: '07-26 13:12',
          operation: '核销课时',
          delta: 0,
          description: '锁定 -1 / 已用 +1',
        },
      ],
    },
    {
      id: 'appeal-240722',
      lessonId: 'lesson-0720',
      memberId: 'member-xuyan',
      memberName: '许妍',
      coachName: '周岚',
      courseAt: '2026-07-20 09:00–10:00',
      packageId: 'package-xu-posture',
      reason: '对课程状态有疑问。',
      note: '已与教练确认。',
      status: 'rejected',
      createdAt: '2026-07-22 11:04',
      source: '会员确认完成',
      balanceChanges: [],
      decisionNote: '核对签到与双方记录，课程已正常完成。',
      handledAt: '2026-07-22 14:30',
    },
  ],
  sales: [
    {
      id: 'sale-1',
      memberName: '许妍',
      productName: '6 节体态改善包',
      amount: 2880,
      paidAt: '2026-07-29 18:42',
    },
    {
      id: 'sale-2',
      memberName: '沈舟',
      productName: '8 节私教基础包',
      amount: 3280,
      paidAt: '2026-07-28 12:16',
    },
  ],
})

const clone = <T>(value: T): T => structuredClone(value)

const readData = (): AdminData => {
  const stored = localStorage.getItem(DATA_KEY)
  if (stored) {
    const data = JSON.parse(stored) as AdminData
    for (const member of data.members) {
      for (const membership of member.packages) membership.changes ??= []
    }
    return data
  }
  const data = seedData()
  localStorage.setItem(DATA_KEY, JSON.stringify(data))
  return data
}

const writeData = (data: AdminData): void => {
  localStorage.setItem(DATA_KEY, JSON.stringify(data))
}

const findPackage = (data: AdminData, packageId: string) => {
  for (const member of data.members) {
    const membership = member.packages.find((item) => item.id === packageId)
    if (membership) return membership
  }
  throw new Error('没有找到会员课包')
}

const updateAppeal = (
  appeal: Appeal,
  decision: 'approve' | 'reject',
  decisionNote: string,
): void => {
  appeal.status = decision === 'approve' ? 'approved' : 'rejected'
  appeal.decisionNote = decisionNote
  appeal.handledAt = '2026-07-30 14:30'
}

export const developmentApi: AdminApi = {
  getSession: () => sessionStorage.getItem(SESSION_KEY) === 'active',
  async login(username, password) {
    if (username !== 'admin' || password !== 'Purui2026!') {
      throw new Error('账号或密码不正确')
    }
    sessionStorage.setItem(SESSION_KEY, 'active')
  },
  async logout() {
    sessionStorage.removeItem(SESSION_KEY)
  },
  async loadData() {
    return clone(readData())
  },
  async saveCoach(input: CoachInput) {
    const data = readData()
    const existing = input.id ? data.coaches.find((coach) => coach.id === input.id) : undefined
    if (existing) {
      Object.assign(existing, input)
      writeData(data)
      return { id: existing.id }
    } else {
      const coach = {
        id: `coach-${Date.now()}`,
        userId: input.userId,
        name: input.name,
        phone: input.phone,
        specialty: input.specialty,
        status: 'active' as const,
        schedule: [],
        history: [],
      }
      data.coaches.push(coach)
      writeData(data)
      return { id: coach.id }
    }
  },
  async setCoachStatus(id: string, status: CoachStatus) {
    const data = readData()
    const coach = data.coaches.find((item) => item.id === id)
    if (!coach) throw new Error('没有找到教练')
    coach.status = status
    writeData(data)
  },
  async adjustPackage(packageId, delta, note) {
    const data = readData()
    const membership = findPackage(data, packageId)
    if (membership.available + delta < 0) throw new Error('可用课时不足')
    membership.available += delta
    membership.total += delta
    membership.changes.push({
      id: `change-${membership.id}-${membership.changes.length + 1}`,
      operation: 'manual_adjust',
      availableDelta: delta,
      lockedDelta: 0,
      usedDelta: 0,
      totalDelta: delta,
      createdAt: '2026-07-30 14:30',
      note,
    })
    writeData(data)
  },
  async saveProduct(input: ProductInput) {
    const data = readData()
    const existing = input.id ? data.products.find((item) => item.id === input.id) : undefined
    if (existing) {
      Object.assign(existing, input)
    } else {
      data.products.push({
        id: `product-${Date.now()}`,
        name: input.name,
        price: input.price,
        lessons: input.lessons,
        status: 'unpublished',
        soldCount: 0,
      })
    }
    writeData(data)
  },
  async setProductStatus(id: string, status: ProductStatus) {
    const data = readData()
    const product = data.products.find((item) => item.id === id)
    if (!product) throw new Error('没有找到课包商品')
    product.status = status
    writeData(data)
  },
  async decideAppeal(id, decision, decisionNote) {
    const data = readData()
    const appeal = data.appeals.find((item) => item.id === id)
    if (!appeal) throw new Error('没有找到申诉')
    if (appeal.status !== 'pending') throw new Error('申诉已经处理')
    updateAppeal(appeal, decision, decisionNote)
    if (decision === 'approve') {
      const membership = findPackage(data, appeal.packageId)
      if (membership.used < 1) throw new Error('没有可退回的已用课时')
      membership.available += 1
      membership.used -= 1
      const refund = {
        id: `change-${membership.id}-${membership.changes.length + 1}`,
        operation: 'appeal_refund' as const,
        availableDelta: 1,
        lockedDelta: 0,
        usedDelta: -1,
        totalDelta: 0,
        createdAt: '2026-07-30 14:30',
        note: decisionNote,
      }
      membership.changes.push(refund)
      appeal.balanceChanges.push({
        id: refund.id,
        at: refund.createdAt,
        operation: '申诉退款',
        delta: 1,
        description: '可用 +1 / 已用 -1',
      })
    }
    writeData(data)
  },
}

export const resetDevelopmentData = (): void => {
  localStorage.removeItem(DATA_KEY)
  sessionStorage.removeItem(SESSION_KEY)
}
