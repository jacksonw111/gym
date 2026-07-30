import { DomainError, type Lesson } from './store'

export type Actor =
  | { kind: 'member'; id: string }
  | { kind: 'coach'; id: string }
  | { kind: 'admin'; id: string }
  | { kind: 'system'; id: string }

export const assertCanAccessLesson = (actor: Actor, lesson: Lesson): void => {
  if (actor.kind === 'admin' || actor.kind === 'system') return
  if (actor.kind === 'member' && lesson.memberId === actor.id) return
  if (actor.kind === 'coach' && lesson.coachId === actor.id) return
  throw new DomainError('没有权限访问该课程')
}
