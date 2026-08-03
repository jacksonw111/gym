import {
  DomainError,
  isMembershipExpired,
  type MembershipPackage,
  membershipHasBalance,
  type Store,
} from './store'

export interface LeaveCoachInput {
  coachId: string
  /** 有需转移的有效课包时必填；不能是离职教练本人 */
  transferCoachId?: string
  now: string
}

export interface LeaveCoachResult {
  /** 已转移给接收教练的有效会员课包数量 */
  transferredMemberships: number
  /** 随课包一并转移的待上课预约数量 */
  transferredLessons: number
  /** 已下架的课包商品数量 */
  unpublishedProducts: number
  transferCoachName?: string
}

const transferableMemberships = (store: Store, coachId: string, now: string): MembershipPackage[] =>
  store.packages.filter(
    (membership) =>
      membership.coachId === coachId &&
      membershipHasBalance(membership) &&
      !isMembershipExpired(membership, new Date(now)),
  )

/**
 * 教练离职：
 * 1. 仍有未过期且剩余课时的会员课包时，必须先转移给另一位在职教练（课包与其待上课预约一并转移）。
 * 2. 转移完成后下架该教练的全部课包商品。
 * 3. 将教练状态置为离职，不再接受新预约，但已购会员的预约与历史课程不受影响。
 */
export const leaveCoach = async (store: Store, input: LeaveCoachInput): Promise<LeaveCoachResult> =>
  store.transaction(() => {
    const coach = store.coaches.find((item) => item.id === input.coachId)
    if (!coach) throw new DomainError('教练不存在')
    if (coach.status !== 'active') throw new DomainError('该教练已离职')

    const transferable = transferableMemberships(store, coach.id, input.now)
    let transferCoachName: string | undefined
    let transferredLessons = 0

    if (transferable.length > 0) {
      if (!input.transferCoachId) {
        throw new DomainError(`该教练仍有 ${transferable.length} 份有效会员课包，请先选择接收教练`)
      }
      if (input.transferCoachId === coach.id) {
        throw new DomainError('接收教练不能是离职教练本人')
      }
      const transferCoach = store.coaches.find((item) => item.id === input.transferCoachId)
      if (transferCoach?.status !== 'active') {
        throw new DomainError('接收教练不存在或已离职')
      }
      const membershipIds = new Set(transferable.map((membership) => membership.id))
      for (const membership of transferable) {
        membership.coachId = transferCoach.id
        membership.coachName = transferCoach.name
      }
      for (const lesson of store.lessons) {
        if (
          lesson.status === 'booked' &&
          lesson.coachId === coach.id &&
          membershipIds.has(lesson.membershipPackageId)
        ) {
          lesson.coachId = transferCoach.id
          transferredLessons += 1
        }
      }
      transferCoachName = transferCoach.name
    }

    let unpublishedProducts = 0
    for (const product of store.products) {
      if (product.coachId === coach.id && product.status === 'published') {
        product.status = 'unpublished'
        unpublishedProducts += 1
      }
    }

    coach.status = 'inactive'
    return {
      transferredMemberships: transferable.length,
      transferredLessons,
      unpublishedProducts,
      ...(transferCoachName ? { transferCoachName } : {}),
    }
  })
