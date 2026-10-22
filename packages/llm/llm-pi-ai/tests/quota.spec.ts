import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OAuthCredential, Provider } from '@earendil-works/pi-ai'
import type { AuthorizationQuota } from '@deepseek-ai/dsh-authorization'
import type { CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { catalogProvider } from '../src/catalog.ts'
import { describeGrant, grantIdentityFields, quotaProbe } from '../src/quota.ts'

/** Every upstream URL a quota probe may reach, keyed by host substring. */
const calls: { url: string; init: RequestInit | undefined }[] = []

/** Install a fetch stub whose `script` maps url substrings to responses. */
function stubFetch(script: Record<string, { status?: number; body: unknown }>): void {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push({ url, init })
    const match = Object.entries(script).find(([fragment]) => url.includes(fragment))
    if (match === undefined) return new Response('not found', { status: 404 })
    const { status = 200, body } = match[1]
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }))
}

afterEach(() => {
  calls.length = 0
  vi.unstubAllGlobals()
})

const PERSISTED: unknown[] = []
const persist = (payload: unknown): Promise<void> => {
  PERSISTED.push(payload)
  return Promise.resolve()
}

/** A fresh access token, so no probe refreshes unless the spec asks it to. */
function live(extra: Record<string, unknown> = {}): OAuthCredential {
  return { type: 'oauth', access: 'at-live', refresh: 'rt', expires: Date.now() + 3_600_000, ...extra }
}

/** An already-expired token, so the probe must refresh before calling out. */
function dead(extra: Record<string, unknown> = {}): OAuthCredential {
  return { type: 'oauth', access: 'at-dead', refresh: 'rt', expires: Date.now() - 1_000, ...extra }
}

/** A provider whose `refresh` is scripted — the probe receives it through `oauth`. */
function providerWithRefresh(id: string, refresh: (credential: OAuthCredential) => Promise<OAuthCredential>): Provider {
  return {
    id,
    name: id,
    auth: {
      oauth: {
        name: 'n',
        login: () => Promise.reject(new Error('login unused in quota specs')),
        refresh,
        toAuth: credential => Promise.resolve({ apiKey: credential.access }),
      },
    },
    getModels: () => [],
    stream: () => { throw new Error('stream unused in quota specs') },
    streamSimple: () => { throw new Error('streamSimple unused in quota specs') },
  }
}

/** A provider that offers no OAuth member at all. */
function providerWithoutOauth(id: string): Provider {
  return {
    id,
    name: id,
    auth: {},
    getModels: () => [],
    stream: () => { throw new Error('stream unused in quota specs') },
    streamSimple: () => { throw new Error('streamSimple unused in quota specs') },
  }
}

async function probe(provider: Provider, payload: unknown): Promise<AuthorizationQuota | undefined> {
  const quota = quotaProbe(provider)
  if (quota === undefined) throw new Error(`expected a quota probe for ${provider.id}`)
  return quota({ payload, signal: new AbortController().signal, persist })
}

describe('quotaProbe selection', () => {
  it('answers nothing for a provider whose usage endpoint this adapter does not know', () => {
    const google = catalogProvider('google')
    expect(google).not.toBeUndefined()
    expect(quotaProbe(google!)).toBeUndefined()
    expect(quotaProbe(providerWithRefresh('unlisted', () => Promise.reject(new Error('never called'))))).toBeUndefined()
    expect(quotaProbe(providerWithoutOauth('anthropic'))).toBeUndefined()
  })

  it('answers nothing when the credential is not an OAuth grant', async () => {
    PERSISTED.length = 0
    const anthropic = catalogProvider('anthropic')!
    await expect(probe(anthropic, { type: 'api_key', key: 'sk' })).resolves.toBeUndefined()
    await expect(probe(anthropic, { some: 'shape' })).resolves.toBeUndefined()
    // An oauth-typed payload without an access token is not a credential either.
    await expect(probe(anthropic, { type: 'oauth' })).resolves.toBeUndefined()
    await expect(probe(anthropic, 'a string, not an object')).resolves.toBeUndefined()
  })
})

describe('anthropic quota', () => {
  const usage = {
    five_hour: { utilization: 42, resets_at: '2026-01-01T00:00:00Z' },
    seven_day: { utilization: 7.4, resets_at: 1_800_000_000 },
    seven_day_sonnet: { utilization: 20, resets_at: 1_800_000_000_000 },
    limits: [
      { kind: 'weekly_scoped', percent: 12, resets_at: '2026-01-02T00:00:00Z', scope: { model: { display_name: 'Opus' } } },
      { kind: 'unrelated', percent: 99 },
    ],
  }

  it('normalizes the session, weekly, and scoped windows', async () => {
    stubFetch({ 'oauth/usage': { body: usage } })
    const quota = await probe(catalogProvider('anthropic')!, live({ email: 'a@b.c' }))

    expect(quota!.windows).toEqual([
      { id: 'five-hour', label: 'Session (5h)', usedPercent: 42, resetAt: Date.parse('2026-01-01T00:00:00Z') },
      { id: 'seven-day', label: 'Weekly (7d)', usedPercent: 7.4, resetAt: 1_800_000_000_000 },
      { id: 'seven_day_sonnet', label: 'Weekly sonnet (7d)', usedPercent: 20, resetAt: 1_800_000_000_000 },
      { id: 'weekly-opus', label: 'Weekly Opus (7d)', usedPercent: 12, resetAt: Date.parse('2026-01-02T00:00:00Z') },
    ])
    const request = calls.find(call => call.url.includes('oauth/usage'))!
    expect((request.init!.headers as Record<string, string>)['anthropic-beta']).toBe('oauth-2025-04-20')
    // A labelled record needs no profile call at all.
    expect(calls.some(call => call.url.includes('oauth/profile'))).toBe(false)
  })

  it('learns the account email from the profile endpoint when the record has none', async () => {
    stubFetch({
      'oauth/usage': { body: { five_hour: { utilization: 1 } } },
      'oauth/profile': { body: { account: { email: 'learned@anthropic.test' } } },
    })
    await probe(catalogProvider('anthropic')!, live())

    expect(calls.some(call => call.url.includes('oauth/profile'))).toBe(true)
    expect(PERSISTED.at(-1)).toMatchObject({ label: 'learned@anthropic.test', access: 'at-live' })
  })

  it('refreshes an expired grant and persists the rotated credential before probing', async () => {
    stubFetch({ 'oauth/usage': { body: usage } })
    const provider = providerWithRefresh('anthropic', credential => Promise.resolve({ ...credential, access: 'at-new' }))
    PERSISTED.length = 0

    await probe(provider, dead({ label: 'kept' }))

    expect(PERSISTED[0]).toMatchObject({ access: 'at-new', refresh: 'rt', label: 'kept' })
    expect((calls.at(-1)!.init!.headers as Record<string, string>)['Authorization']).toBe('Bearer at-new')
  })

  it('names a refused endpoint instead of fabricating windows', async () => {
    stubFetch({ 'oauth/usage': { status: 429, body: {} } })
    await expect(probe(catalogProvider('anthropic')!, live({ label: 'x' }))).rejects.toThrow('429')
  })

  it('names a non-object usage answer and skips windows that carry no utilization', async () => {
    stubFetch({ 'oauth/usage': { body: null } })
    await expect(probe(catalogProvider('anthropic')!, live({ label: 'x' }))).rejects.toThrow('no usage object')

    stubFetch({
      'oauth/usage': { body: { five_hour: { utilization: 9 }, seven_day_bad: {}, limits: [{ kind: 'weekly_scoped' }] } },
      'oauth/profile': { body: {} },
    })
    const quota = await probe(catalogProvider('anthropic')!, live())
    expect(quota!.windows).toEqual([{ id: 'five-hour', label: 'Session (5h)', usedPercent: 9 }])
  })

  it('reports no windows when the endpoint answers an empty object', async () => {
    stubFetch({
      'oauth/usage': { body: {} },
      'oauth/profile': { body: {} },
    })
    const quota = await probe(catalogProvider('anthropic')!, live({ email: 'e@x' }))
    expect(quota!.windows).toEqual([])
    expect(quota!.message).toContain('no quota windows')
  })

  it('treats a profile answer without an email as leaving the record unlabelled', async () => {
    stubFetch({
      'oauth/usage': { body: { five_hour: { utilization: 1 } } },
      'oauth/profile': { status: 404, body: {} },
    })
    PERSISTED.length = 0
    await probe(catalogProvider('anthropic')!, live())
    // The label enrichment is best-effort: no email, no extra persist.
    expect(PERSISTED).toHaveLength(0)
  })
})

describe('openai-codex quota', () => {
  it('sends the account header and reports the plan beside the windows', async () => {
    stubFetch({
      'wham/usage': {
        body: {
          plan_type: 'plus',
          rate_limit: {
            primary_window: { used_percent: 30, reset_at: 1_800_000_000 },
            secondary_window: { used_percent: 5, resets_at: '2026-01-05T00:00:00Z' },
          },
          rate_limits_by_limit_id: { code_review: { primary_window: { used_percent: 60 } } },
        },
      },
    })
    const quota = await probe(catalogProvider('openai-codex')!, live({ accountId: 'acct-1' }))

    const headers = calls[0]!.init!.headers as Record<string, string>
    expect(headers['ChatGPT-Account-ID']).toBe('acct-1')
    expect(headers['originator']).toBe('codex_cli_rs')
    expect(quota!.plan).toBe('plus')
    expect(quota!.windows.map(window => window.id)).toEqual(['five-hour', 'seven-day', 'code-review'])
  })

  it('omits the account header and tolerates the alternate response spellings', async () => {
    stubFetch({
      'wham/usage': {
        body: {
          summary: { plan: 'team' },
          rate_limits: { primary: { percent_used: 55 }, secondary: { percent_used: 10, resetAt: '2026-02-01T00:00:00Z' } },
          spark_rate_limit: { percent_used: 3 },
        },
      },
    })
    const quota = await probe(catalogProvider('openai-codex')!, live())

    expect((calls[0]!.init!.headers as Record<string, string>)['ChatGPT-Account-ID']).toBeUndefined()
    expect(quota!.plan).toBe('team')
    expect(quota!.windows.map(window => window.id)).toEqual(['five-hour', 'seven-day', 'spark'])
  })

  it('names a non-object usage answer', async () => {
    stubFetch({ 'wham/usage': { body: 42 } })
    await expect(probe(catalogProvider('openai-codex')!, live())).rejects.toThrow('no usage object')
  })

  it('falls through the flat response spellings and the extra-limit fallbacks', async () => {
    stubFetch({
      'wham/usage': {
        body: {
          primary_window: { percent_used: 17, resetAt: 1_800_000_000_000 },
          rate_limits_by_limit_id: { codex_review: { primary_window: { percent_used: 88 } } },
          code_review_rate_limit: { used_percent: 5 },
        },
      },
    })
    const quota = await probe(catalogProvider('openai-codex')!, live({ accountId: 'a' }))

    expect(quota!.plan).toBeUndefined()
    expect(quota!.windows).toEqual([
      { id: 'five-hour', label: 'Session (5h)', usedPercent: 17, resetAt: 1_800_000_000_000 },
      { id: 'code-review', label: 'Code review', usedPercent: 88 },
    ])
  })

  it('normalizes a window that reports no usage number to zero', async () => {
    stubFetch({ 'wham/usage': { body: { rate_limit: { primary_window: {} } } } })
    const quota = await probe(catalogProvider('openai-codex')!, live())
    expect(quota!.windows).toEqual([{ id: 'five-hour', label: 'Session (5h)', usedPercent: 0 }])
  })

  it('answers nothing for a non-grant payload and reports empty rate data', async () => {
    await expect(probe(catalogProvider('openai-codex')!, { type: 'api_key' })).resolves.toBeUndefined()

    stubFetch({ 'wham/usage': { body: { rate_limit: {} } } })
    const quota = await probe(catalogProvider('openai-codex')!, live())
    expect(quota!.windows).toEqual([])
    expect(quota!.message).toContain('no quota windows')
  })
})

describe('antigravity quota', () => {
  const summary = {
    groups: [
      {
        displayName: 'Gemini models',
        buckets: [
          { bucketId: 'gemini-weekly', window: 'weekly', remainingFraction: 0.25, resetTime: '2026-01-08T00:00:00Z' },
          { bucketId: 'gemini-5h', window: '5h', remainingFraction: 0.9, resetTime: '2026-01-01T05:00:00Z' },
          { bucketId: 'gemini-daily-hidden', window: 'weekly', remainingFraction: 0.5, disabled: true },
        ],
      },
      {
        displayName: 'Claude & GPT models',
        buckets: [
          { bucketId: 'claude-weekly', window: 'weekly', remainingFraction: 0, disabled: false, resetTime: 1_800_000_000 },
          { bucketId: 'claude-5h', window: '5h', remainingFraction: 0.4, disabled: true, resetTime: 1_800_000_000 },
        ],
      },
      { displayName: 'Internal tools', buckets: [{ bucketId: 'x', window: 'weekly', remainingFraction: 0.1 }] },
    ],
  }

  it('posts the stored project and normalizes the bucket families', async () => {
    stubFetch({ 'retrieveUserQuotaSummary': { body: summary } })
    const quota = await probe(catalogProvider('antigravity')!, live({ projectId: 'proj-9' }))

    const request = calls[0]!
    expect(request.init!.method).toBe('POST')
    expect(request.init!.body).toBe(JSON.stringify({ project: 'proj-9' }))
    const headers = request.init!.headers as Record<string, string>
    expect(headers['User-Agent']).toBe('antigravity/ide/2.22.0 darwin/arm64')
    expect(headers['Authorization']).toBe('Bearer at-live')

    // A disabled weekly bucket is skipped; a disabled session bucket reads as spent.
    expect(quota!.windows).toEqual([
      { id: 'gemini-weekly', label: 'Gemini (Weekly)', usedPercent: 75, resetAt: Date.parse('2026-01-08T00:00:00Z') },
      { id: 'gemini-five-hour', label: 'Gemini (5h)', usedPercent: 10, resetAt: Date.parse('2026-01-01T05:00:00Z') },
      { id: 'claude-gpt-weekly', label: 'Claude & GPT (Weekly)', usedPercent: 100, resetAt: 1_800_000_000_000 },
      { id: 'claude-gpt-five-hour', label: 'Claude & GPT (5h)', usedPercent: 100, resetAt: 1_800_000_000_000 },
    ])
  })

  it('sends an empty project when the grant never learned one', async () => {
    stubFetch({ 'retrieveUserQuotaSummary': { body: { groups: [] } } })
    const quota = await probe(catalogProvider('antigravity')!, live())

    expect(calls[0]!.init!.body).toBe('{}')
    expect(quota!.windows).toEqual([])
    expect(quota!.message).toContain('no quota windows')
  })

  it('reads the summary-wrapped spelling and skips buckets that name nothing', async () => {
    stubFetch({
      'retrieveUserQuotaSummary': {
        body: {
          quotaSummary: {
            groups: [
              {
                displayName: 'Gemini',
                buckets: [
                  { bucketId: 'a', window: 'hourly', remainingFraction: 0.5 },
                  { bucketId: 'b', window: 'weekly' },
                  { bucketId: 'first', window: 'weekly', remainingFraction: 1 },
                  { bucketId: 'second', window: 'weekly', remainingFraction: 0.5 },
                ],
              },
              // A group whose name matches no family contributes nothing.
              { buckets: [{ window: 'weekly', remainingFraction: 0.1 }] },
              // A family-matching group with no bucket array and a non-object
              // bucket entry both pass through without rows.
              { displayName: 'Claude models' },
              { displayName: 'Gemini', buckets: ['junk'] },
            ],
          },
        },
      },
    })
    const quota = await probe(catalogProvider('antigravity')!, live({ label: 'x' }))

    // The unknown window and the fraction-less bucket drop; the second weekly
    // bucket never displaces the first.
    expect(quota!.windows).toEqual([
      { id: 'gemini-weekly', label: 'Gemini (Weekly)', usedPercent: 0 },
    ])
  })

  it('answers nothing for a non-grant payload and names refusals', async () => {
    await expect(probe(catalogProvider('antigravity')!, { type: 'api_key' })).resolves.toBeUndefined()

    stubFetch({ 'retrieveUserQuotaSummary': { status: 403, body: {} } })
    await expect(probe(catalogProvider('antigravity')!, live())).rejects.toThrow('403')

    stubFetch({ 'retrieveUserQuotaSummary': { body: 'text' } })
    await expect(probe(catalogProvider('antigravity')!, live())).rejects.toThrow('no usage object')
  })

  it('reports no windows for a payload that carries neither groups spelling', async () => {
    stubFetch({ 'retrieveUserQuotaSummary': { body: { unrelated: true } } })
    const quota = await probe(catalogProvider('antigravity')!, live())
    expect(quota!.windows).toEqual([])
    expect(quota!.message).toContain('no quota windows')
  })
})

describe('describeGrant', () => {
  const record = (payload: unknown): CredentialRecord => ({ kind: 'grant', payload: payload as Record<string, unknown> })

  it('prefers a stored label, then a stored email, and reports both as the dedup identity', () => {
    expect(describeGrant('anthropic', record({ label: 'kept', email: 'other' })))
      .toEqual({ label: 'kept', identity: 'kept' })
    expect(describeGrant('anthropic', record({ email: 'Mail@x.test' })))
      .toEqual({ label: 'Mail@x.test', identity: 'mail@x.test' })
    expect(describeGrant('antigravity', record({ email: 'g@x.test' })))
      .toEqual({ label: 'g@x.test', identity: 'g@x.test' })
  })

  it('reads the codex account off the access-token claims when nothing was stored', () => {
    const claims = { email: 'claims@openai.test' }
    const access = `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`
    expect(describeGrant('openai-codex', record({ access })))
      .toEqual({ label: 'claims@openai.test', identity: 'claims@openai.test' })
    // The nested profile claim is the other spelling ChatGPT tokens use.
    const nested = `h.${Buffer.from(JSON.stringify({ 'https://api.openai.com/profile': { email: 'nested@x.test' } })).toString('base64url')}.s`
    expect(describeGrant('openai-codex', record({ access: nested })))
      .toEqual({ label: 'nested@x.test', identity: 'nested@x.test' })
    // The ChatGPT account id is the stable identity when the record stored one.
    expect(describeGrant('openai-codex', record({ access: 'not-a-jwt', accountId: 'acct-9' })))
      .toEqual({ label: 'acct-9', identity: 'chatgpt:acct-9' })
    expect(describeGrant('openai-codex', record({ access: 'h.!!!.s', accountId: 'acct-0' })))
      .toEqual({ label: 'acct-0', identity: 'chatgpt:acct-0' })
    // An account id outranks the email claims: it is the upstream identity.
    expect(describeGrant('openai-codex', record({ access, accountId: 'acct-9' })))
      .toEqual({ label: 'claims@openai.test', identity: 'chatgpt:acct-9' })
  })

  it('reports the stored access token\'s own expiry', () => {
    expect(describeGrant('antigravity', record({ email: 'g@x.test', expires: 1_700_000_000_000 })))
      .toEqual({ label: 'g@x.test', identity: 'g@x.test', expiresAt: 1_700_000_000_000 })
    expect(describeGrant('anthropic', record({ expires: 42 }))).toEqual({ expiresAt: 42 })
  })

  it('answers nothing for api-key records and unlabeled grants of other providers', () => {
    expect(describeGrant('anthropic', { kind: 'api-key', key: 'k' })).toEqual({})
    expect(describeGrant('anthropic', record({ access: 'opaque' }))).toEqual({})
    // A grant whose payload is not an object, and a codex grant whose token
    // decodes to nothing claim-shaped — both answer no label, not a throw.
    expect(describeGrant('openai-codex', record('junk'))).toEqual({})
    expect(describeGrant('openai-codex', record({ access: 'h.e30=.s' }))).toEqual({})
  })
})

describe('grantIdentityFields', () => {
  it('reads the anthropic account email off the profile endpoint for a bare grant', async () => {
    stubFetch({ '/api/oauth/profile': { body: { account: { email: 'claude@x.test' } } } })

    await expect(grantIdentityFields('anthropic', live(), AbortSignal.timeout(5_000)))
      .resolves.toEqual({ label: 'claude@x.test' })
    expect(calls.map(call => call.url)).toEqual([
      expect.stringContaining('/api/oauth/profile'),
    ])
    expect(calls[0]?.init?.headers).toMatchObject({ 'anthropic-beta': 'oauth-2025-04-20' })
  })

  it('adds nothing when the grant already carries an identity, is not oauth, or is not anthropic', async () => {
    stubFetch({})
    await expect(grantIdentityFields('anthropic', live({ label: 'named' }), AbortSignal.timeout(5_000)))
      .resolves.toBeUndefined()
    await expect(grantIdentityFields('anthropic', live({ email: 'has@x.test' }), AbortSignal.timeout(5_000)))
      .resolves.toBeUndefined()
    await expect(grantIdentityFields('anthropic', { type: 'api_key', key: 'sk' }, AbortSignal.timeout(5_000)))
      .resolves.toBeUndefined()
    await expect(grantIdentityFields('antigravity', live(), AbortSignal.timeout(5_000)))
      .resolves.toBeUndefined()
    expect(calls).toEqual([])
  })

  it('declines rather than fail the sign-in when the profile read cannot answer', async () => {
    stubFetch({ '/api/oauth/profile': { status: 500, body: {} } })
    await expect(grantIdentityFields('anthropic', live(), AbortSignal.timeout(5_000)))
      .resolves.toBeUndefined()

    // A profile answer without an account email is the other "nothing to add".
    stubFetch({ '/api/oauth/profile': { body: { account: {} } } })
    await expect(grantIdentityFields('anthropic', live(), AbortSignal.timeout(5_000)))
      .resolves.toBeUndefined()
  })
})
