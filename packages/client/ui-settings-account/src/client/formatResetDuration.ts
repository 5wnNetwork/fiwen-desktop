/** Duration formatting for the daily quota reset instant on account balance cards. */

/** Intl tags for the UI locale ids; other ids pass through unchanged. */
const INTL_TAGS: Record<string, string> = { en: 'en-US', zh: 'zh-CN', vi: 'vi-VN' }

/**
 * Format the time left until a reset instant as one narrow unit, matching the
 * unit to the wait: days from 24 hours up, hours up to a day, and minutes below
 * an hour so a sub-hour wait never rounds down to zero.
 * @param iso - the reset instant as an ISO timestamp.
 * @param now - the instant the display renders at, in milliseconds.
 * @param locale - active UI locale id.
 * @returns localized duration text such as `13h` or `2d`.
 */
export function formatResetDuration(iso: string, now: number, locale = 'en'): string {
  const ms = Math.max(0, Date.parse(iso) - now)
  const hour = 3_600_000
  const [unit, value] = ms >= 24 * hour
    ? ['day' as const, Math.round(ms / (24 * hour))] as const
    : ms >= hour
      ? ['hour' as const, Math.round(ms / hour)] as const
      : ['minute' as const, Math.max(1, Math.ceil(ms / 60_000))] as const
  return new Intl.NumberFormat(INTL_TAGS[locale] ?? locale, { style: 'unit', unit, unitDisplay: 'narrow' }).format(value)
}
