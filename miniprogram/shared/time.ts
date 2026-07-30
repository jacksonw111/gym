export interface LessonSlot {
  startsAt: string
  endsAt: string
  label: string
}

const HOUR_IN_MILLISECONDS = 60 * 60 * 1000
const DAY_IN_MILLISECONDS = 24 * HOUR_IN_MILLISECONDS
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

const assertValidDate = (date: string): void => {
  const match = DATE_PATTERN.exec(date)
  if (!match) {
    throw new Error('INVALID_DATE')
  }

  const parsedDate = new Date(`${date}T00:00:00Z`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() + 1 !== month ||
    parsedDate.getUTCDate() !== day
  ) {
    throw new Error('INVALID_DATE')
  }
}

export const createDefaultSlots = (date: string): LessonSlot[] => {
  assertValidDate(date)

  return Array.from({ length: 11 }, (_, index) => {
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
}

export const canMemberCancel = (startsAt: Date, now: Date): boolean =>
  startsAt.getTime() - now.getTime() >= 2 * HOUR_IN_MILLISECONDS

export const canSubmitAppeal = (consumedAt: Date, now: Date): boolean => {
  const elapsed = now.getTime() - consumedAt.getTime()
  return elapsed >= 0 && elapsed <= 7 * DAY_IN_MILLISECONDS
}
