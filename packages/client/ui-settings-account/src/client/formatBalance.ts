/** Platform Web currency formatting for account balances; source amounts retain decimal precision. */
import { Big } from 'big.js'

/** Currency codes the balance cards render. */
export type BalanceCurrency = 'CNY' | 'USD' | 'VND'

/** Intl tags for the UI locale ids; other ids pass through unchanged. */
const INTL_TAGS: Record<string, string> = { en: 'en-US', zh: 'zh-CN', vi: 'vi-VN' }

/**
 * Format a balance using Platform Web's two-decimal and sub-cent display rules for fiat
 * currencies, or whole-unit Intl currency display for VND.
 * @param amount - validated decimal balance string.
 * @param currency - wallet currency code.
 * @param locale - active UI locale id for VND's locale-aware grouping.
 * @returns signed currency text with grouped digits.
 */
export function formatBalance(amount: string, currency: BalanceCurrency, locale = 'en'): string {
  if (currency === 'VND') return formatVnd(amount, locale)
  const symbol = currency === 'CNY' ? '¥' : '$'
  const value = new Big(amount)
  if (value.eq(0)) return `${symbol}0.00`
  if (value.lt(0)) return `-${symbol}${value.gt(-0.01) ? '0.01' : addCommas(value.abs().toFixed(2))}`
  if (value.lt('0.01')) return `<${symbol}0.01`
  return `${symbol}${addCommas(value.round(2, Big.roundDown).toFixed(2))}`
}

function formatVnd(amount: string, locale: string): string {
  const tag = INTL_TAGS[locale] ?? locale
  return new Intl.NumberFormat(tag, { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })
    .format(new Big(amount).round(0).toNumber())
}

function addCommas(value: string): string {
  const [integer, fraction] = value.split('.')
  return `${Number(integer).toLocaleString()}.${fraction}`
}
