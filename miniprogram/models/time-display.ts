const CHINA_OFFSET_MILLISECONDS = 8 * 60 * 60 * 1000

export interface ShanghaiDateParts {
  year: number
  month: number
  day: number
  weekday: number
  hour: number
  minute: number
}

export const getShanghaiDateParts = (value: string | Date): ShanghaiDateParts => {
  const instant = typeof value === 'string' ? new Date(value) : value
  const shifted = new Date(instant.getTime() + CHINA_OFFSET_MILLISECONDS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  }
}

const twoDigits = (value: number): string => String(value).padStart(2, '0')

export const formatShanghaiDate = (value: string | Date): string => {
  const parts = getShanghaiDateParts(value)
  return `${parts.year}-${twoDigits(parts.month)}-${twoDigits(parts.day)}`
}

export const formatShanghaiHour = (value: string | Date): string => {
  const parts = getShanghaiDateParts(value)
  return `${twoDigits(parts.hour)}:${twoDigits(parts.minute)}`
}

export const formatShanghaiHourRange = (startsAt: string, endsAt: string): string =>
  `${formatShanghaiHour(startsAt)}–${formatShanghaiHour(endsAt)}`
