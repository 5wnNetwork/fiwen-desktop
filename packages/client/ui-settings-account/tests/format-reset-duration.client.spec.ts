import { expect, it } from 'vitest'
import { formatResetDuration } from '../src/client/formatResetDuration.ts'

const NOW = Date.parse('2030-01-02T09:00:00.000Z')
const iso = (offset: number) => new Date(NOW + offset).toISOString()

it.each([
  [24 * 3_600_000, '1d'],
  [30 * 3_600_000, '1d'],
  [49 * 3_600_000, '2d'],
])('formats a wait of %sms in days', (offset, expected) => {
  expect(formatResetDuration(iso(offset), NOW)).toBe(expected)
})

it.each([
  [3_600_000, '1h'],
  [1.4 * 3_600_000, '1h'],
  [13 * 3_600_000, '13h'],
  [23.6 * 3_600_000, '24h'],
])('formats a wait of %sms in hours', (offset, expected) => {
  expect(formatResetDuration(iso(offset), NOW)).toBe(expected)
})

it.each([
  [59.9 * 60_000, '60m'],
  [30 * 60_000, '30m'],
  // Sub-minute and elapsed waits floor at one minute rather than read zero.
  [30_000, '1m'],
  [0, '1m'],
  [-60_000, '1m'],
])('formats a sub-hour wait of %sms in minutes', (offset, expected) => {
  expect(formatResetDuration(iso(offset), NOW)).toBe(expected)
})

it.each([
  ['zh', '13小时'],
  ['vi', '13 giờ'],
  // Untagged locales pass through to Intl unchanged.
  ['fr', '13h'],
])('formats the wait in locale %s', (locale, expected) => {
  expect(formatResetDuration(iso(13 * 3_600_000), NOW, locale)).toBe(expected)
})
