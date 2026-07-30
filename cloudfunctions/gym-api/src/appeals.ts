import { type Appeal, appendLedger, assertPackageInvariant, type Store } from './store'

export interface CreateAppealInput {
  memberId: string
  lessonId: string
  reason: string
  note?: string
  now: string
}

export const createAppeal = async (store: Store, input: CreateAppealInput): Promise<Appeal> =>
  store.transaction(() => {
    if (!input.reason.trim()) throw new Error('申诉原因不能为空')
    const lesson = store.lessons.find(
      (item) => item.id === input.lessonId && item.memberId === input.memberId,
    )
    if (!lesson?.consumedAt || !['completed', 'coach_cancelled_consumed'].includes(lesson.status)) {
      throw new Error('只有已消耗课程可以申诉')
    }
    const elapsed = new Date(input.now).getTime() - new Date(lesson.consumedAt).getTime()
    if (elapsed < 0 || elapsed > 7 * 24 * 60 * 60 * 1000) throw new Error('已超过七天申诉期')
    if (store.appeals.some((item) => item.lessonId === lesson.id)) {
      throw new Error('该课程已经提交过申诉')
    }
    const appeal: Appeal = {
      id: store.nextId('appeal'),
      lessonId: lesson.id,
      memberId: input.memberId,
      reason: input.reason.trim(),
      note: input.note,
      createdAt: input.now,
      status: 'pending',
      lessonRefunded: false,
    }
    store.appeals.push(appeal)
    return appeal
  })

export interface DecideAppealInput {
  appealId: string
  decision: 'approve' | 'reject'
  decisionNote: string
  adminId: string
  now: string
}

export const decideAppeal = async (store: Store, input: DecideAppealInput): Promise<Appeal> =>
  store.transaction(() => {
    if (!input.decisionNote.trim()) throw new Error('处理说明不能为空')
    const appeal = store.appeals.find((item) => item.id === input.appealId)
    if (!appeal) throw new Error('申诉不存在')
    if (appeal.status !== 'pending') return appeal

    if (input.decision === 'approve') {
      const lesson = store.lessons.find((item) => item.id === appeal.lessonId)
      const membership = store.packages.find((item) => item.id === lesson?.membershipPackageId)
      if (!lesson || !membership || membership.usedLessons < 1) throw new Error('已用课时不存在')
      membership.availableLessons += 1
      membership.usedLessons -= 1
      assertPackageInvariant(membership)
      appeal.status = 'approved'
      appeal.lessonRefunded = true
      appeal.refundedAt = input.now
      appendLedger(store, {
        packageId: membership.id,
        lessonId: lesson.id,
        operation: 'appeal_refund',
        availableDelta: 1,
        lockedDelta: 0,
        usedDelta: -1,
        totalDelta: 0,
        createdAt: input.now,
        actorId: input.adminId,
        note: input.decisionNote.trim(),
      })
    } else {
      appeal.status = 'rejected'
    }
    appeal.handledBy = input.adminId
    appeal.handledAt = input.now
    appeal.decisionNote = input.decisionNote.trim()
    return appeal
  })
