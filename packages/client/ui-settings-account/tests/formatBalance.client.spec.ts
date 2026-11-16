import { expect, it } from 'vitest'
import { formatBalance, formatPoints } from '../src/client/formatBalance.ts'

it.each([
  ['0.000000', '¥0.00'], ['12.34000000', '¥12.34'], ['1234.56999', '¥1,234.56'],
  ['0.00000001', '<¥0.01'], ['0.01', '¥0.01'], ['-0.000001', '-¥0.01'],
  ['-12.345', '-¥12.35'], ['-0.0000', '¥0.00'],
  // The Platform wire schema can carry exponent notation, which Big parses natively.
  ['0E-16', '¥0.00'], ['5.0000000000000000', '¥5.00'], ['5e0', '¥5.00'], ['1E-8', '<¥0.01'],
])('formats %s using Platform currency rules', (amount, expected) => {
  expect(formatBalance(amount, '¥')).toBe(expected)
})

it.each([
  ['0', '0'], ['1250000', '1,250,000'], ['1234.5', '1,235'], ['1234.4', '1,234'],
  ['-200000', '-200,000'], ['380000', '380,000'], ['5e0', '5'],
])('formats %s as points without a currency unit', (amount, expected) => {
  expect(formatPoints(amount)).toBe(expected)
})

it.each([
  ['0', '0₫'], ['1250000', '1,250,000₫'], ['1234.5', '1,235₫'], ['-200000', '-200,000₫'],
])('formats a dong wallet %s as whole units', (amount, expected) => {
  expect(formatBalance(amount, '₫')).toBe(expected)
})
