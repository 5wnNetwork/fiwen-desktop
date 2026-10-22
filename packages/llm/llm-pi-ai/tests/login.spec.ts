import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AuthorizationService from '@deepseek-ai/dsh-authorization'
import type { AuthorizationInteraction, AuthorizationNotice, AuthorizationPrompt } from '@deepseek-ai/dsh-authorization'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialKey } from '@deepseek-ai/dsh-credentials'
import type { AuthEvent, AuthInteraction, AuthPrompt, AuthType, Credential } from '@earendil-works/pi-ai'

const login = vi.hoisted(() => vi.fn())

// The whole of what this module does with pi-ai is run one provider's login
// against a collection built with the harness store, so the collection is the
// boundary worth observing; a real login would open a browser.
vi.mock('../src/models.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../src/models.ts')>(),
  createModels: () => ({ setProvider: () => {}, login }),
}))

const { credentialStoreFrom, authContextFrom, recordKeyFor } = await import('../src/auth.ts')
const { catalogProvider } = await import('../src/catalog.ts')
const { registerPiAiFlows } = await import('../src/login.ts')

const CODEX = recordKeyFor('openai-codex')
const dirs: string[] = []

/** A context with the record store, the seam, and every pi-ai login flow. */
async function harness(): Promise<Context> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-pi-login-'))
  dirs.push(dir)
  const ctx = new Context()
  await ctx.plugin(LocalCredentialProvider, { path: join(dir, '.credentials.yaml'), watch: false })
  await ctx.plugin(AuthorizationService)
  registerPiAiFlows(ctx, { credentials: credentialStoreFrom(ctx), authContext: authContextFrom(ctx) })
  return ctx
}

/** An interaction recording everything a flow says, answering every question. */
function surface(answer = 'typed'): AuthorizationInteraction & {
  notices: AuthorizationNotice[]
  prompts: AuthorizationPrompt[]
} {
  const notices: AuthorizationNotice[] = []
  const prompts: AuthorizationPrompt[] = []
  return {
    notices,
    prompts,
    notify: (notice) => { notices.push(notice) },
    prompt: (prompt) => {
      prompts.push(prompt)
      return Promise.resolve(answer)
    },
  }
}

/** Drive one attempt, letting the mocked login talk back through `converse`. */
async function attempt(
  ctx: Context,
  converse: (interaction: AuthInteraction) => Promise<void>,
  request: { key?: CredentialKey; method?: string; account?: string } = {},
): Promise<ReturnType<typeof surface>> {
  const ui = surface()
  login.mockImplementation(async (providerId: string, _type: AuthType, interaction: AuthInteraction) => {
    await converse(interaction)
    const granted: Credential = { type: 'oauth', access: 'at', refresh: 'rt', expires: 1 }
    await credentialStoreFrom(ctx).modify(providerId, () => Promise.resolve(granted))
    return granted
  })
  const key = request.key ?? CODEX
  const commit = request.account === undefined ? key : credentialKey('llm-pi-ai', `${key.split('/')[1]}--${request.account}`)
  await expect(ctx.authorization.begin({
    key,
    interaction: ui,
    ...request.method === undefined ? {} : { method: request.method },
    ...request.account === undefined ? {} : { account: request.account },
  })).resolves.toEqual({ status: 'authorized', key: commit })
  return ui
}

beforeEach(() => {
  // The login-time identity enrichment is the one fetch a flow may fire; a
  // spec that wants it answered stubs its own profile response over this.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })))
})

afterEach(async () => {
  login.mockReset()
  vi.unstubAllGlobals()
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('pi-ai login flows', () => {
  it('offers one flow per installed provider, with the methods that provider ships', async () => {
    const ctx = await harness()
    const offered = ctx.authorization.list()

    // The OAuth-only provider is exactly the case this exists for: nothing
    // else could ever configure it.
    expect(offered.find(entry => entry.key === CODEX)?.methods)
      .toEqual([{ id: 'oauth', label: expect.stringContaining('ChatGPT') as string }])
    // A provider offering both keeps both, the subscription login first.
    expect(offered.find(entry => entry.key === recordKeyFor('anthropic'))?.methods.map(one => one.id))
      .toEqual(['oauth', 'api-key'])
    // A key-only provider still gets a flow, because pi-ai collects the key
    // through its own prompt rather than leaving it to the settings form.
    expect(offered.find(entry => entry.key === recordKeyFor('deepseek'))?.methods.map(one => one.id))
      .toEqual(['api-key'])
    // pi-ai ships Sign in with ChatGPT for `openai`, which needs an
    // installation ID the harness does not supply; only the key login is offered.
    expect(catalogProvider('openai')?.auth.oauth?.loginLabel).toBe('Sign in with ChatGPT')
    expect(offered.find(entry => entry.key === recordKeyFor('openai'))?.methods.map(one => one.id))
      .toEqual(['api-key'])
  })

  it('runs the pi-ai auth type the chosen method names', async () => {
    const ctx = await harness()

    await attempt(ctx, () => Promise.resolve())
    expect(login).toHaveBeenLastCalledWith('openai-codex', 'oauth', expect.anything())

    await attempt(ctx, () => Promise.resolve(), { key: recordKeyFor('anthropic'), method: 'api-key' })
    expect(login).toHaveBeenLastCalledWith('anthropic', 'api_key', expect.anything())
  })

  it('commits what the login produced, where the adapter reads it back', async () => {
    const ctx = await harness()

    await attempt(ctx, () => Promise.resolve())

    await expect(ctx.credentials.readRecord(CODEX)).resolves.toEqual({
      kind: 'grant',
      payload: { type: 'oauth', access: 'at', refresh: 'rt', expires: 1 },
    })
  })

  it('restates every pi-ai login event in the neutral vocabulary', async () => {
    const ctx = await harness()
    const events: AuthEvent[] = [
      { type: 'info', message: 'Read this first', links: [{ url: 'https://help.example' }] },
      { type: 'info', message: 'Nothing to open' },
      { type: 'auth_url', url: 'https://auth.example/start', instructions: 'Approve in the tab' },
      { type: 'auth_url', url: 'https://auth.example/plain' },
      { type: 'device_code', userCode: 'WXYZ-1234', verificationUri: 'https://device.example' },
      { type: 'progress', message: 'Exchanging the code' },
      // pi-ai's event union is open; an unrecognised member must still show
      // the human that something is happening.
      { type: 'quantum-handshake' } as unknown as AuthEvent,
    ]

    const ui = await attempt(ctx, (interaction) => {
      for (const event of events) interaction.notify(event)
      return Promise.resolve()
    })

    expect(ui.notices).toEqual([
      { message: 'Read this first', url: 'https://help.example' },
      { message: 'Nothing to open' },
      { message: 'Approve in the tab', url: 'https://auth.example/start' },
      { message: 'Open this page to continue signing in.', url: 'https://auth.example/plain' },
      {
        message: 'Enter this code on the verification page to finish signing in.',
        url: 'https://device.example',
        code: 'WXYZ-1234',
      },
      { message: 'Exchanging the code' },
      { message: 'Signing in…' },
    ])
  })

  it('restates every pi-ai prompt, carrying the per-prompt withdrawal signal', async () => {
    const ctx = await harness()
    const withdraw = new AbortController()
    const prompts: AuthPrompt[] = [
      { type: 'text', message: 'Your workspace', placeholder: 'acme' },
      { type: 'secret', message: 'Paste the key' },
      { type: 'secret', message: 'Paste the token', placeholder: 'sk-…' },
      { type: 'select', message: 'Which account?', options: [{ id: 'a', label: 'Work' }] },
      // The manual-code question a browser callback can win the race against.
      { type: 'manual_code', message: 'Paste the code', signal: withdraw.signal },
    ]

    const ui = await attempt(ctx, async (interaction) => {
      for (const prompt of prompts) await interaction.prompt(prompt)
    })

    expect(ui.prompts).toEqual([
      { kind: 'text', message: 'Your workspace', placeholder: 'acme' },
      { kind: 'secret', message: 'Paste the key' },
      { kind: 'secret', message: 'Paste the token', placeholder: 'sk-…' },
      { kind: 'select', message: 'Which account?', options: [{ id: 'a', label: 'Work' }] },
      { kind: 'text', message: 'Paste the code', signal: withdraw.signal },
    ])
  })

  it('hands the flow the attempt-wide cancellation signal', async () => {
    const ctx = await harness()
    let seen: AbortSignal | undefined
    const controller = new AbortController()
    login.mockImplementation((_id: string, _type: AuthType, interaction: AuthInteraction) => {
      seen = interaction.signal
      controller.abort()
      return new Promise(() => {})
    })

    await expect(ctx.authorization.begin({
      key: CODEX,
      interaction: surface(),
      signal: controller.signal,
    })).resolves.toEqual({ status: 'cancelled', key: CODEX })
    expect(seen?.aborted).toBe(true)
  })

  it('commits an account attempt to its suffixed record and selects it', async () => {
    const ctx = await harness()

    // The seam hands the attempt `account`; the flow clones the provider under
    // the suffixed id so pi-ai's own store write lands on the account record.
    await attempt(ctx, () => Promise.resolve(), { key: recordKeyFor('anthropic'), account: 'acct-9' })
    expect(login).toHaveBeenLastCalledWith('anthropic--acct-9', 'oauth', expect.anything())

    const accountKey = credentialKey('llm-pi-ai', 'anthropic--acct-9')
    await expect(ctx.credentials.readRecord(accountKey)).resolves.toEqual({
      kind: 'grant',
      payload: { type: 'oauth', access: 'at', refresh: 'rt', expires: 1 },
    })
    // A fresh account becomes the selected one, and the bare id serves it.
    await expect(ctx.credentials.readRecord(credentialKey('llm-pi-ai', 'anthropic--selected')))
      .resolves.toEqual({ kind: 'grant', payload: { account: 'acct-9' } })
    await expect(credentialStoreFrom(ctx).read('anthropic')).resolves.toMatchObject({ access: 'at' })
  })

  it('lists accounts with labels and reports quota through the flow', async () => {
    const ctx = await harness()
    await attempt(ctx, () => Promise.resolve(), { key: recordKeyFor('anthropic'), account: 'acct-9' })

    const accounts = await ctx.authorization.listAccounts(recordKeyFor('anthropic'))
    expect(accounts).toEqual([
      { key: credentialKey('llm-pi-ai', 'anthropic--acct-9'), account: 'acct-9', expiresAt: 1, selected: true },
    ])
  })

  it('writes the profile-read account label onto the committed grant, so repeat sign-ins dedup', async () => {
    const ctx = await harness()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ account: { email: 'claude@x.test' } }),
      { headers: { 'Content-Type': 'application/json' } })))

    const anthropic = recordKeyFor('anthropic')
    await attempt(ctx, () => Promise.resolve(), { key: anthropic, account: 'acct-9' })

    const first = credentialKey('llm-pi-ai', 'anthropic--acct-9')
    await expect(ctx.credentials.readRecord(first)).resolves.toEqual({
      kind: 'grant',
      payload: { type: 'oauth', access: 'at', refresh: 'rt', expires: 1, label: 'claude@x.test' },
    })
    await expect(ctx.authorization.listAccounts(anthropic)).resolves.toEqual([
      { key: first, account: 'acct-9', label: 'claude@x.test', expiresAt: 1, selected: true },
    ])

    // Signing the same upstream account in under a new slot replaces the
    // first entry rather than listing the same account twice.
    await attempt(ctx, () => Promise.resolve(), { key: anthropic, account: 'acct-1' })
    await expect(ctx.authorization.listAccounts(anthropic)).resolves.toEqual([
      { key: credentialKey('llm-pi-ai', 'anthropic--acct-1'), account: 'acct-1', label: 'claude@x.test', expiresAt: 1, selected: true },
    ])
    await expect(ctx.credentials.describeRecord(first)).resolves.toMatchObject({ configured: false })
  })

  it('leaves an api-key commit out of the grant identity read', async () => {
    const ctx = await harness()
    const anthropic = recordKeyFor('anthropic')
    login.mockImplementation(async (providerId: string, _type: AuthType) => {
      const granted: Credential = { type: 'api_key', key: 'sk-live' }
      await credentialStoreFrom(ctx).modify(providerId, () => Promise.resolve(granted))
    })

    const ui = surface()
    await expect(ctx.authorization.begin({ key: anthropic, method: 'api-key', interaction: ui }))
      .resolves.toEqual({ status: 'authorized', key: anthropic })

    await expect(ctx.credentials.readRecord(anthropic)).resolves.toEqual({ kind: 'api-key', key: 'sk-live' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not overwrite a record that stopped being a grant while the profile read ran', async () => {
    const ctx = await harness()
    const anthropic = recordKeyFor('anthropic')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ account: { email: 'claude@x.test' } }),
      { headers: { 'Content-Type': 'application/json' } })))
    login.mockImplementation(async (providerId: string, _type: AuthType) => {
      const granted: Credential = { type: 'oauth', access: 'at', refresh: 'rt', expires: 1 }
      await credentialStoreFrom(ctx).modify(providerId, () => Promise.resolve(granted))
    })
    // The label merge re-reads through modifyRecord; a record rewritten to
    // another kind between the enrichment read and the merge is left alone
    // rather than having grant fields spliced onto it.
    const realRead = ctx.credentials.readRecord.bind(ctx.credentials)
    vi.spyOn(ctx.credentials, 'readRecord').mockImplementation(async (key) => {
      const record = await realRead(key)
      if (key === anthropic && record?.kind === 'grant') {
        await ctx.credentials.modifyRecord(anthropic, () => Promise.resolve({ kind: 'api-key', key: 'sk-rotated' }))
      }
      return record
    })

    const ui = surface()
    await expect(ctx.authorization.begin({ key: anthropic, method: 'oauth', interaction: ui }))
      .resolves.toEqual({ status: 'authorized', key: anthropic })
    await expect(ctx.credentials.readRecord(anthropic)).resolves.toEqual({ kind: 'api-key', key: 'sk-rotated' })
  })
})
