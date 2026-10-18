import { describe, expect, it } from 'vitest'
import { en, formatDesktopMessage, resolveDesktopLocale, resolveDesktopStartupLocale, vi, zh } from '../src/locale.ts'

describe('desktop locale dictionaries', () => {
  it('ships the same key set in English, Chinese, and Vietnamese', () => {
    expect(Object.keys(zh)).toEqual(Object.keys(en))
    expect(Object.keys(vi)).toEqual(Object.keys(en))
    expect(resolveDesktopLocale('zh-Hans-CN').messages).toEqual(zh)
    expect(resolveDesktopLocale('en-US').messages).toEqual(en)
    expect(resolveDesktopLocale('vi-VN').messages).toEqual(vi)
    expect(resolveDesktopLocale('vi').messages).toEqual(vi)
    expect(resolveDesktopLocale('fr-FR').messages).toEqual(en)
  })

  it('formats named values without consuming unknown placeholders', () => {
    expect(formatDesktopMessage('{name}@{version} {missing}', { name: 'plugin', version: '1.2.3' }))
      .toBe('plugin@1.2.3 {missing}')
  })

  it('prefers an explicit supported choice, then the Vietnamese deployment default', () => {
    expect(resolveDesktopStartupLocale('zh', ['en-US']).id).toBe('zh-CN')
    expect(resolveDesktopStartupLocale('EN', ['zh-CN']).id).toBe('en')
    expect(resolveDesktopStartupLocale('vi', ['en-US']).id).toBe('vi')
    expect(resolveDesktopStartupLocale(null, ['ja-JP', 'zh-Hant', 'en-US']).id).toBe('vi')
    expect(resolveDesktopStartupLocale(null, []).id).toBe('vi')
    expect(resolveDesktopStartupLocale('ja', ['zh-CN']).id).toBe('vi')
  })

})
