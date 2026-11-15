// @vitest-environment jsdom
import { cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, onTestFinished } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import * as HostPlugin from '../src/index.ts'
import * as CardPlugin from '../src/client/index.ts'
import { vi } from '../src/client/locales.ts'

const ITEM = 'plugins.item'

const DECLARATION = { [ITEM]: { kind: 'list', scope: 'root' } } as const

afterEach(cleanup)

async function runtime() {
  const host = await SlotTestRuntime.create()
  onTestFinished(() => host.dispose())
  const locale = new LocaleRuntime(host.ctx)
  host.ctx.provide('locale', locale)
  host.slots.installLocale(locale)
  return { host, locale }
}

describe('Fiwen web search settings card', () => {
  it('keeps the host Loader entry inert', () => {
    expect(HostPlugin.apply).not.toThrow()
  })

  it('declares only the services it uses', () => {
    expect(CardPlugin.inject).toEqual(['slots', 'locale'])
  })

  it('occupies the plugins page item slot once mounted', async () => {
    const { host } = await runtime()
    await host.declare({ ...DECLARATION })
    await host.mount(CardPlugin)
    expect(host.slots.entries(ITEM)).toHaveLength(1)
  })

  it('withdraws the card when its row is disposed', async () => {
    const { host } = await runtime()
    await host.declare({ ...DECLARATION })
    const handle = await host.mount(CardPlugin)
    expect(host.slots.entries(ITEM)).toHaveLength(1)
    await handle.dispose()
    expect(host.slots.entries(ITEM)).toHaveLength(0)
  })

  it('summarizes the service as the Fiwen one', async () => {
    const { host } = await runtime()
    await host.declare({ ...DECLARATION })
    await host.mount(CardPlugin)
    const view = host.renderSlot(ITEM, { view: 'summary' })
    expect(view.container.textContent).toContain('Fiwen')
  })

  it('explains on the page that nothing needs configuring', async () => {
    const { host } = await runtime()
    await host.declare({ ...DECLARATION })
    await host.mount(CardPlugin)
    const view = host.renderSlot(ITEM, { view: 'page' })
    expect(view.container.textContent).toContain('run on your signed-in Fiwen service')
    expect(view.container.textContent).toContain('There is no key or endpoint to configure.')
  })

  it('carries Vietnamese copy for the deployment default locale', () => {
    expect(vi.title).toBe('Tìm kiếm web')
    expect(vi.description).toContain('dịch vụ Fiwen')
    expect(vi.note).toBe('Không cần cấu hình khóa hay địa chỉ.')
  })
})
