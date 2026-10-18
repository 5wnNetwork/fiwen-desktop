/**
 * Plugin wiring: the browser half adds `vi` to the catalog, registers every
 * namespace dictionary, and removes them all when the fiber disposes.
 */
import { Context } from '@deepseek-ai/cordis'
import { onTestFinished } from 'vitest'
import { describe, expect, it } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'

import { apply, inject } from '../src/client/index.ts'
import { VI_DICTIONARIES } from '../src/locales/index.ts'

describe('apply', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['locale'])
  })

  it('registers vi with English fallback and every namespace dictionary', async () => {
    const ctx = new Context()
    onTestFinished(async () => { await ctx.fiber.dispose() })
    const svc = new LocaleRuntime(ctx)
    ctx.provide('locale', svc)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    onTestFinished(async () => { await fiber.dispose() })
    await fiber.await()

    const language = svc.getLocale().locales.find(l => l.id === 'vi')
    expect(language).toMatchObject({ label: 'Tiếng Việt', fallback: 'en' })

    svc.setLocale('vi')
    expect(svc.bind('chat')('view.chat')).toBe('Trò chuyện')
    expect(svc.bind('common')('copy')).toBe(VI_DICTIONARIES['common']['copy'])

    await fiber.dispose()
    expect(svc.getLocale().locales.map(l => l.id)).not.toContain('vi')
    // Dictionaries leave with the language: bound lookups fall to English.
    expect(svc.bind('chat')('view.chat')).not.toBe('Trò chuyện')
  })
})
