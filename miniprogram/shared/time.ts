export interface LessonSlot {
  startsAt: string
  endsAt: string
  label: string
}

const HOUR_IN_MILLISECONDS = 60 * 60 * 1000
const DAY_IN_MILLISECONDS = 24 * HOUR_IN_MILLISECONDS

export const createDefaultSlots = (date: string): LessonSlot[] =>
  Array.from({ length: 11 }, (_, index) => {
    const hour = index + 10
    const nextHour = hour + 1
    const startsAt = `${date}T${String(hour).padStart(2, '0')}:00:00+08:00`
    const endsAt = `${date}T${String(nextHour).padStart(2, '0')}:00:00+08:00`

    return {
      startsAt,
      endsAt,
      label: `${String(hour).padStart(2, '0')}:00–${String(nextHour).padStart(2, '0')}:00`,
    }
  })

export const canMemberCancel = (startsAt: Date, now: Date): boolean =>
  startsAt.getTime() - now.getTime() >= 2 * HOUR_IN_MILLISECONDS

export const canSubmitAppeal = (consumedAt: Date, now: Date): boolean => {
  const elapsed = now.getTime() - consumedAt.getTime()
  return elapsed >= 0 && elapsed <= 7 * DAY_IN_MILLISECONDS
}
