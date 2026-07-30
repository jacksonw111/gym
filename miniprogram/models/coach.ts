import type { Lesson } from '../shared/contracts'
import { createDefaultSlots } from '../shared/time'
import { formatShanghaiDate, formatShanghaiHourRange } from './time-display'

export interface CoachScheduleSlot {
  startsAt: string
  endsAt: string
  label: string
  open: boolean
  occupied?: boolean
  lesson?: Lesson
  memberName?: string
  memberPhone?: string
  locked?: boolean
}

export interface RemoteScheduleSlot {
  startsAt: string
  endsAt: string
  open: boolean
  occupied?: boolean
  lessonId?: string
  memberName?: string
  memberPhone?: string
}

type ScheduleLesson = Lesson & {
  memberName?: string
  memberPhone?: string
}

export const buildDefaultSchedule = (date: string): CoachScheduleSlot[] =>
  createDefaultSlots(date).map((slot) => ({ ...slot, open: true }))

export const mergeRemoteSchedule = (
  date: string,
  remoteSlots: RemoteScheduleSlot[],
  lessons: ScheduleLesson[],
  coachId: string,
): CoachScheduleSlot[] =>
  buildDefaultSchedule(date).map((defaultSlot) => {
    const remoteSlot = remoteSlots.find(
      (slot) =>
        formatShanghaiDate(slot.startsAt) === date &&
        Date.parse(slot.startsAt) === Date.parse(defaultSlot.startsAt),
    )
    const lesson = lessons.find(
      (candidate) =>
        candidate.coachId === coachId &&
        candidate.status === 'booked' &&
        Date.parse(candidate.startsAt) === Date.parse(defaultSlot.startsAt),
    )
    const occupied = remoteSlot?.occupied === true || Boolean(lesson)
    return {
      startsAt: remoteSlot?.startsAt ?? defaultSlot.startsAt,
      endsAt: remoteSlot?.endsAt ?? defaultSlot.endsAt,
      label: formatShanghaiHourRange(
        remoteSlot?.startsAt ?? defaultSlot.startsAt,
        remoteSlot?.endsAt ?? defaultSlot.endsAt,
      ),
      open: remoteSlot?.open ?? false,
      ...(occupied ? { occupied: true, locked: true } : {}),
      ...(lesson
        ? {
            lesson,
            ...(lesson.memberName || remoteSlot?.memberName
              ? { memberName: lesson.memberName ?? remoteSlot?.memberName }
              : {}),
            ...(lesson.memberPhone || remoteSlot?.memberPhone
              ? { memberPhone: lesson.memberPhone ?? remoteSlot?.memberPhone }
              : {}),
          }
        : remoteSlot?.memberName || remoteSlot?.memberPhone
          ? {
              ...(remoteSlot.memberName ? { memberName: remoteSlot.memberName } : {}),
              ...(remoteSlot.memberPhone ? { memberPhone: remoteSlot.memberPhone } : {}),
            }
          : {}),
    }
  })

export interface BulkAvailabilityResult {
  slots: CoachScheduleSlot[]
  changed: number
  skippedBooked: number
}

export const applyBulkAvailability = (
  slots: CoachScheduleSlot[],
  open: boolean,
): BulkAvailabilityResult => {
  let changed = 0
  let skippedBooked = 0
  const nextSlots = slots.map((slot) => {
    if (slot.lesson?.status === 'booked') {
      skippedBooked += 1
      return { ...slot, locked: true }
    }
    if (slot.open !== open) {
      changed += 1
    }
    return { ...slot, open, locked: false }
  })

  return { slots: nextSlots, changed, skippedBooked }
}

export const sortCoachLessons = <T extends Pick<Lesson, 'startsAt'>>(lessons: T[]): T[] =>
  [...lessons].sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt))
