import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import { describe, expect, it, vi } from 'vitest'
import { ProviderAccountsDirectory } from '../src/client/accounts.ts'

const flow = (id: string, methods: Array<{ id: string; label: string }> = [{ id: 'oauth', label: 'OAuth' }]) => ({
  key: `llm-pi-ai/${id}`, label: id, methods, inFlight: false, configured: true,
})

const rows = (id: string, selected: string) => [
  { key: credentialKey('llm-pi-ai', `${id}--acct-one`), account: 'acct-one', label: 'one@example.com', selected: selected === 'acct-one' },
  { key: credentialKey('llm-pi-ai', `${id}--acct-two`), account: 'acct-two', label: 'two@example.com', selected: selected === 'acct-two' },
]

interface Script {
  list?: () => Promise<unknown>
  listAccounts?: (key: string) => Promise<unknown>
  selectAccount?: (key: string, account: string) => Promise<unknown>
}

function directory(authorization: Script): ProviderAccountsDirectory {
  // The providing plugin's context, scripted down to the three calls it makes.
  return new ProviderAccountsDirectory({ remote: { authorization } } as never)
}

describe('ProviderAccountsDirectory', () => {
  it('joins OAuth flows to provider route ids and skips api-key-only flows', async () => {
    const listAccounts = vi.fn((key: string) => Promise.resolve({ ok: true as const, value: rows(key.split('/')[1]!, 'acct-one') }))
    const subject = directory({
      list: () => Promise.resolve({
        ok: true as const,
        value: [
          flow('anthropic'),
          flow('openai-codex'),
          flow('key-only', [{ id: 'api-key', label: 'API key' }]),
        ],
      }),
      listAccounts,
    })
    await subject.load()
    const { byProvider, status } = subject.store.getSnapshot()
    expect(status).toBe('ready')
    expect([...byProvider.keys()]).toEqual(['anthropic', 'openai-codex'])
    expect(byProvider.get('anthropic')?.accounts.map(row => row.account)).toEqual(['acct-one', 'acct-two'])
    expect(listAccounts).toHaveBeenCalledTimes(2)
    // The ready mirror skips a reload until an event invalidates it.
    await subject.load()
    expect(listAccounts).toHaveBeenCalledTimes(2)
  })

  it('drops only the flow whose enumeration refused, keeping the rest', async () => {
    const subject = directory({
      list: () => Promise.resolve({ ok: true as const, value: [flow('anthropic'), flow('antigravity')] }),
      listAccounts: (key: string) => Promise.resolve(key.includes('antigravity')
        ? { ok: false as const, error: new RemoteError('authorization/rejected', 'not stored', { key }) }
        : { ok: true as const, value: rows('anthropic', 'acct-two') }),
    })
    await subject.load()
    const { byProvider } = subject.store.getSnapshot()
    expect([...byProvider.keys()]).toEqual(['anthropic'])
    expect(byProvider.get('anthropic')?.accounts[1]?.selected).toBe(true)
  })

  it('keeps the first flow when two scopes share one provider id', async () => {
    const subject = directory({
      list: () => Promise.resolve({
        ok: true as const,
        value: [
          { ...flow('anthropic'), key: 'llm-pi-ai/anthropic' },
          { ...flow('anthropic'), key: 'other-scope/anthropic' },
        ],
      }),
      listAccounts: (key: string) => Promise.resolve({
        ok: true as const,
        value: [{ key: credentialKey(key.split('/')[0]!, `${key.split('/')[1]!}--acct-x`), account: 'acct-x', selected: true }],
      }),
    })
    await subject.load()
    expect(subject.store.getSnapshot().byProvider.get('anthropic')?.key).toBe('llm-pi-ai/anthropic')
  })

  it('selects through the flow key and reports an unknown provider as no flow', async () => {
    const selectAccount = vi.fn(() => Promise.resolve({ ok: true as const, value: undefined }))
    const subject = directory({
      list: () => Promise.resolve({ ok: true as const, value: [flow('anthropic')] }),
      listAccounts: () => Promise.resolve({ ok: true as const, value: rows('anthropic', 'acct-one') }),
      selectAccount,
    })
    await subject.load()
    await expect(subject.select('anthropic', 'acct-two')).resolves.toEqual({ ok: true, value: undefined })
    expect(selectAccount).toHaveBeenCalledWith(credentialKey('llm-pi-ai', 'anthropic'), 'acct-two')
    await expect(subject.select('openai-codex', 'acct-one')).resolves.toBeUndefined()
  })

  it('shares one failing request, exposes the RPC error, and permits a retry', async () => {
    const list = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: new RemoteError('gateway/internal', 'authorization offline', {}) })
      .mockResolvedValueOnce({ ok: true, value: [flow('anthropic')] })
    const subject = directory({
      list,
      listAccounts: () => Promise.resolve({ ok: true as const, value: rows('anthropic', 'acct-one') }),
    })
    const first = subject.load()
    expect(subject.load()).toBe(first)
    await first
    expect(subject.store.getSnapshot()).toMatchObject({ status: 'error', error: 'gateway/internal: authorization offline' })
    await subject.load()
    expect(subject.store.getSnapshot().status).toBe('ready')
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('does not publish a successful result from an invalidated generation', async () => {
    const first = Promise.withResolvers<unknown>()
    const second = Promise.withResolvers<unknown>()
    const subject = directory({
      list: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
      listAccounts: () => Promise.resolve({ ok: true as const, value: [] }),
    })
    const stale = subject.load()
    subject.refresh()
    first.resolve({ ok: true, value: [flow('stale-scope')] })
    await stale
    expect(subject.store.getSnapshot().status).toBe('loading')
    second.resolve({ ok: true, value: [flow('fresh-scope')] })
    await vi.waitFor(() => {
      expect([...subject.store.getSnapshot().byProvider.keys()]).toEqual(['fresh-scope'])
    })
  })

  it('does not publish a failure from an invalidated generation', async () => {
    const first = Promise.withResolvers<unknown>()
    const second = Promise.withResolvers<unknown>()
    const subject = directory({
      list: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
      listAccounts: () => Promise.resolve({ ok: true as const, value: [] }),
    })
    const stale = subject.load()
    subject.refresh()
    first.reject(new Error('stale failure'))
    await stale
    expect(subject.store.getSnapshot()).toMatchObject({ status: 'loading', error: null })
    second.resolve({ ok: true, value: [] })
    await vi.waitFor(() => {
      expect(subject.store.getSnapshot().status).toBe('ready')
    })
  })

  it('retains rows on refresh failure and clears them on a failed Host reset', async () => {
    const list = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: [flow('anthropic')] })
      .mockRejectedValueOnce('refresh failed')
      .mockRejectedValueOnce(new Error('reset failed'))
    const subject = directory({
      list,
      listAccounts: () => Promise.resolve({ ok: true as const, value: rows('anthropic', 'acct-one') }),
    })
    await subject.load()
    subject.refresh()
    await vi.waitFor(() => {
      expect(subject.store.getSnapshot()).toMatchObject({ status: 'error', error: 'refresh failed' })
    })
    expect(subject.store.getSnapshot().byProvider.has('anthropic')).toBe(true)
    subject.resetGeneration()
    await vi.waitFor(() => {
      expect(subject.store.getSnapshot()).toMatchObject({ status: 'error', error: 'reset failed' })
    })
    expect(subject.store.getSnapshot().byProvider.size).toBe(0)
  })
})
