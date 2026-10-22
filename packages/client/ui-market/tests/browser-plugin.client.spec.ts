// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { expect, it, onTestFinished, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { apply as hostApply } from '../src/index.ts'
import type { MarketFace } from '../src/client/market-store.ts'

it('contributes Marketplace to the Plugins page, follows Host changes, and withdraws with its fiber', async () => {
  hostApply()
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const market = {
    catalog: vi.fn(() => Promise.resolve({ ok: true as const, value: { items: [], total: 0, offset: 0, categories: [] } })),
    detail: vi.fn(),
    installItem: vi.fn(),
    uninstallItem: vi.fn(),
    installed: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
  }
  const remote = new TestRemote(ctx, { market })
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({ name: 'root', children: { 'plugins.tab': { kind: 'list', scope: 'root' } } } as never, () => null)
  const fiber = await ctx.plugin({ inject: [...inject], apply }).await()
  const [entry] = slots.entries('plugins.tab')
  expect(entry?.options.id).toBe('market')
  expect(resolveSlotLabel(entry?.options.label)).toBe('Marketplace')
  remote.emit('market/changed', [])
  ctx.emit('connection/reset')
  expect(market.installed).not.toHaveBeenCalled()
  const face = entry!.inject!() as MarketFace
  expect(face.resolveText({ en: 'English' })).toBe('English')
  face.ensure()
  await vi.waitFor(() => { expect(face.hooks.market.getSnapshot().status).toBe('ready') })
  remote.emit('market/changed', [])
  ctx.emit('connection/reset')
  await vi.waitFor(() => { expect(market.installed).toHaveBeenCalledTimes(3) })
  await fiber.dispose()
  expect(slots.entries('plugins.tab')).toEqual([])
})
