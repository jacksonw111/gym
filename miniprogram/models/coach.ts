import type { Lesson } from '../shared/contracts'
import { createDefaultSlots } from '../shared/time'

export interface CoachScheduleSlot {
  startsAt: string
  endsAt: string
  label: string
  open: boolean
  lesson?: Lesson
  memberName?: string
  locked?: boolean
}

export const buildDefaultSchedule = (date: string): CoachScheduleSlot[] =>
  createDefaultSlots(date).map((slot) => ({ ...slot, open: true }))

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
