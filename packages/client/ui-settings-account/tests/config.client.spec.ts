/** Public bonus options are emitted in the page bootstrap. */
import { Context } from '@deepseek-ai/cordis'
import { expect, it, onTestFinished, vi } from 'vitest'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { apply, Config } from '../src/index.ts'
import { BONUS_CONFIG_GLOBAL } from '../src/bonus-config.ts'

it('injects configured bonus options and removes the listener on disposal', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin({ Config, apply }, { bonusAckRetryDelayMs: 25, bonusAckRetryMaxDelayMs: 100 })
  const table: IndexInjection[] = []
  ctx.emit('webserver/index-inject', table)
  expect(table).toEqual([{ kind: 'global', name: BONUS_CONFIG_GLOBAL, value: {
    bonusAckRetryDelayMs: 25, bonusAckRetryMaxDelayMs: 100,
  } }])
  await ctx.fiber.dispose()
  table.length = 0
  ctx.emit('webserver/index-inject', table)
  expect(table).toEqual([])
})

it('hides the generated account form and releases its policy on disposal', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  const release = vi.fn()
  const configure = vi.fn(() => release)
  ctx.provide('settings', { configure } as never)
  const fiber = await ctx.plugin({ Config, apply })
  await ctx.fiber.await()
  expect(configure).toHaveBeenCalledWith({ auto: false }, fiber)
  await fiber.dispose()
  expect(release).toHaveBeenCalledOnce()
})
