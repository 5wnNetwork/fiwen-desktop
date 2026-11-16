/** Platform Web currency formatting for account balances; source amounts retain decimal precision. */
import { Big } from 'big.js'

/** Currency symbols this page can render; VND has no fractional unit. */
export type BalanceSymbol = '¥' | '$' | '₫'

/**
 * Format a balance using Platform Web's two-decimal and sub-cent display rules,
 * except for VND, which is drawn as a whole number because it has no subunit.
 * @param amount - validated decimal balance string.
 * @param symbol - currency symbol.
 * @returns signed currency text with grouped digits.
 */
export function formatBalance(amount: string, symbol: BalanceSymbol): string {
  const value = new Big(amount)
  if (symbol === '₫') {
    const rounded = value.round(0, Big.roundHalfUp)
    return `${rounded.lt(0) ? '-' : ''}${groupDigits(rounded.abs().toFixed(0))}${symbol}`
  }
  if (value.eq(0)) return `${symbol}0.00`
  if (value.lt(0)) return `-${symbol}${value.gt(-0.01) ? '0.01' : addCommas(value.abs().toFixed(2))}`
  if (value.lt('0.01')) return `<${symbol}0.01`
  return `${symbol}${addCommas(value.round(2, Big.roundDown).toFixed(2))}`
}

/**
 * Format a metered point balance: grouped digits with no currency unit. Credit
 * and the daily allowance are points a deployment counts, not money, so they
 * carry no currency symbol.
 * @param amount - validated decimal amount string.
 * @returns grouped whole points.
 */
export function formatPoints(amount: string): string {
  const rounded = new Big(amount).round(0, Big.roundHalfUp)
  return `${rounded.lt(0) ? '-' : ''}${groupDigits(rounded.abs().toFixed(0))}`
}

/** Group the integer part of a fixed-point string, keeping a fraction when one is present. */
function groupDigits(value: string): string {
  const [integer, fraction] = value.split('.')
  const grouped = Number(integer).toLocaleString()
  return fraction === undefined ? grouped : `${grouped}.${fraction}`
}

function addCommas(value: string): string {
  return groupDigits(value)
}
