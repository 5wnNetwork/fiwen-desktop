// @vitest-environment jsdom
import { act, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, onTestFinished } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import * as HostPlugin from '../src/index.ts'
import * as BrandPlugin from '../src/client/index.ts'

const HOLES = ['sidebar.brand.mark', 'sidebar.brand.name', 'conversation.hero.brand.mark'] as const
const [MARK, NAME, HERO] = HOLES

const DECLARATION = {
  [MARK]: { kind: 'single', scope: 'root' },
  [NAME]: { kind: 'single', scope: 'root' },
  [HERO]: { kind: 'single', scope: 'root' },
} as const

afterEach(cleanup)

async function runtime() {
  const host = await SlotTestRuntime.create()
  onTestFinished(() => host.dispose())
  const locale = new LocaleRuntime(host.ctx)
  host.ctx.provide('locale', locale)
  host.slots.installLocale(locale)
  return { host, locale }
}

describe('Fiwen browser-brand plugin', () => {
  it('keeps the host Loader entry inert', () => {
    expect(HostPlugin.apply).not.toThrow()
  })

  it('declares only the services it uses', () => {
    expect(BrandPlugin.inject).toEqual(['slots', 'locale'])
  })

  it('occupies the sidebar and hero brand slots under any build profile', async () => {
    const { host } = await runtime()
    await host.declare({ ...DECLARATION })
    await host.mount(BrandPlugin)
    for (const hole of HOLES) expect(host.slots.entries(hole)).toHaveLength(1)
  })

  it('fills late declarations and removes every occupant on teardown', async () => {
    const { host } = await runtime()
    const handle = await host.mount(BrandPlugin)
    for (const hole of HOLES) expect(host.slots.entries(hole)).toHaveLength(0)
    await host.declare({ ...DECLARATION })
    for (const hole of HOLES) expect(host.slots.entries(hole)).toHaveLength(1)
    await handle.dispose()
    for (const hole of HOLES) expect(host.slots.entries(hole)).toHaveLength(0)
  })

  it('renders the Fiwen mark at the requested size with a per-instance knockout mask', async () => {
    const { host } = await runtime()
    await host.declare({ ...DECLARATION })
    await host.mount(BrandPlugin)
    const sidebar = host.renderSlot(MARK, { size: 34 })
    const hero = host.renderSlot(HERO, { size: 24, className: 'host-mark' })
    const first = sidebar.container.querySelector('svg')!
    const second = hero.container.querySelector('svg')!
    expect(first.getAttribute('width')).toBe('34')
    expect(first.getAttribute('height')).toBe('34')
    expect(first.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(first.getAttribute('aria-hidden')).toBe('true')
    expect(second.getAttribute('width')).toBe('24')
    expect(second.classList.contains('host-mark')).toBe(true)
    const firstMask = first.querySelector('mask')!.id
    const secondMask = second.querySelector('mask')!.id
    expect(firstMask).not.toBe('')
    expect(firstMask).not.toBe(secondMask)
    expect(first.querySelector('rect[mask]')?.getAttribute('mask')).toBe(`url(#${firstMask})`)
    expect(first.querySelectorAll('mask rect[fill="black"]')).toHaveLength(3)
  })

  it.each(['en', 'zh'] as const)('renders the localized product name in %s', async (id) => {
    const { host, locale } = await runtime()
    await host.declare({ ...DECLARATION })
    await host.mount(BrandPlugin)
    const view = host.renderSlot(NAME, {})
    act(() => { locale.setLocale(id) })
    expect(view.container.textContent).toBe(id === 'zh' ? 'Fiwen 桌面端' : 'Fiwen Desktop')
  })
})
