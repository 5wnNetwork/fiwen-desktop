/**
 * The per-provider halves of an authorization flow that read its own stored
 * credential: `describeGrant` names an account off its record, and `quotaProbe`
 * asks the provider's subscription usage endpoint how much of an allowance is
 * left. Both stay inside the seam's opaque-payload rule — the record never
 * leaves the plugin that wrote it, and only non-secret fields come back out.
 *
 * A probe that finds an expired access token refreshes it through the
 * provider's own `OAuthAuth` and writes the rotated credential back through
 * `persist`, which is how a Codex refresh-token rotation survives a quota
 * check instead of stranding the account.
 *
 * @module dsh-llm-pi-ai/quota
 */

import type { OAuthAuth, OAuthCredential, Provider } from '@earendil-works/pi-ai'
import type { AuthorizationFlow, AuthorizationQuota, AuthorizationQuotaWindow } from '@deepseek-ai/dsh-authorization'
import type { CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { LlmError } from '@deepseek-ai/dsh-llm'

/** Anthropic's OAuth usage endpoint; `cedar_ember=1` adds the reset-grant block, as Claude Code sends. */
const ANTHROPIC_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage?cedar_ember=1'
/** Anthropic's OAuth profile endpoint — where a subscription record learns the account's email. */
const ANTHROPIC_PROFILE_URL = 'https://api.anthropic.com/api/oauth/profile'
/** The header that marks an OAuth-scoped request for Anthropic, as Claude Code sends it. */
const ANTHROPIC_OAUTH_BETA = 'oauth-2025-04-20'
/** The Codex backend's own usage endpoint — the one `chatgpt.com/codex` reads. */
const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'
/** The Code Assist quota summary the Antigravity IDE's quota view reads. */
const ANTIGRAVITY_QUOTA_URL = 'https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary'
/** The User-Agent Antigravity calls answer to — the same one the stream sends. */
const ANTIGRAVITY_IDE_USER_AGENT = 'antigravity/ide/2.22.0 darwin/arm64'

/**
 * Narrow the opaque grant payload into pi-ai's OAuth credential shape. The
 * record is what a login or refresh wrote, so the only honest check is the
 * two fields every OAuth credential must carry; extras (`accountId`,
 * `projectId`, a stored `label`) ride through untouched.
 */
function oauthCredentialOf(payload: unknown): OAuthCredential | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const credential = payload as Partial<OAuthCredential>
  return credential.type === 'oauth' && typeof credential.access === 'string'
    ? credential as OAuthCredential
    : undefined
}

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function objectOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function numberOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * The decode half of a JWT — payload claims only, never verification, because
 * this only reads a label off a token the account itself supplied. Malformed
 * input answers `undefined` rather than throwing: a label is enrichment, not
 * a gate.
 */
function jwtClaims(token: string | undefined): Record<string, unknown> | undefined {
  const segment = token?.split('.')[1]
  if (segment === undefined) return undefined
  try {
    return objectOf(JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')))
  } catch {
    return undefined
  }
}

/**
 * A provider quota window's `reset` field, as the endpoints variously write
 * it: ISO string, epoch seconds, or epoch milliseconds. Answers epoch
 * milliseconds, or undefined when the value cannot name a time.
 */
function resetMillis(value: unknown): number | undefined {
  const parsed = typeof value === 'string' ? Date.parse(value) : numberOf(value)
  if (parsed === undefined || !Number.isFinite(parsed)) return undefined
  return parsed < 1e12 ? Math.round(parsed * 1000) : Math.round(parsed)
}

function windowOf(id: string, label: string, used: number | undefined, reset: unknown): AuthorizationQuotaWindow {
  const resetAt = resetMillis(reset)
  return {
    id,
    label,
    usedPercent: Math.max(0, Math.min(100, used ?? 0)),
    ...resetAt === undefined ? {} : { resetAt },
  }
}

/**
 * A credential fresh enough to call upstream with. pi-ai's expiry stamps
 * already carry the provider's own safety margin, so this trusts the stored
 * `expires`; a past one goes through the flow's refresh and the rotated grant
 * is persisted before the probe runs — the caller's account record, never the
 * base record, is where `persist` lands.
 */
async function accessTokenOf(
  oauth: OAuthAuth,
  credential: OAuthCredential,
  input: { signal: AbortSignal; persist(payload: unknown): Promise<void> },
): Promise<OAuthCredential> {
  input.signal.throwIfAborted()
  if (typeof credential.expires === 'number' && credential.expires > Date.now()) return credential
  const refreshed = await oauth.refresh(credential, input.signal)
  await input.persist(refreshed)
  return refreshed
}

/** A quota fetch: fixed URL, no redirects, the attempt's own abort signal. */
async function probe(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { headers, signal, redirect: 'error' })
  if (!response.ok) {
    throw new LlmError(`quota endpoint answered ${String(response.status)}`, 'QUOTA_REFUSED')
  }
  return response.json() as Promise<unknown>
}

/**
 * Anthropic's OAuth usage answer: a 5-hour and a 7-day window plus any
 * model-scoped weekly windows, normalized to the seam's rows.
 */
function anthropicWindows(data: Record<string, unknown>): AuthorizationQuotaWindow[] {
  const windows: AuthorizationQuotaWindow[] = []
  const utilization = (value: unknown): { used: number; reset: unknown } | undefined => {
    const w = objectOf(value)
    const used = numberOf(w?.['utilization'])
    return used === undefined ? undefined : { used, reset: w?.['resets_at'] }
  }
  const fiveHour = utilization(data['five_hour'])
  if (fiveHour !== undefined) windows.push(windowOf('five-hour', 'Session (5h)', fiveHour.used, fiveHour.reset))
  const sevenDay = utilization(data['seven_day'])
  if (sevenDay !== undefined) windows.push(windowOf('seven-day', 'Weekly (7d)', sevenDay.used, sevenDay.reset))
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith('seven_day_')) continue
    const scoped = utilization(value)
    if (scoped !== undefined) windows.push(windowOf(key, `Weekly ${key.slice('seven_day_'.length)} (7d)`, scoped.used, scoped.reset))
  }
  // Model-scoped weekly limits also arrive as { kind: 'weekly_scoped',
  // percent, resets_at, scope: { model: { display_name } } } entries.
  for (const limit of Array.isArray(data['limits']) ? data['limits'] : []) {
    const entry = objectOf(limit)
    if (entry?.['kind'] !== 'weekly_scoped') continue
    const model = stringOf(objectOf(objectOf(entry['scope'])?.['model'])?.['display_name'])
    const percent = numberOf(entry['percent'])
    if (model === undefined || percent === undefined) continue
    windows.push(windowOf(`weekly-${model.toLowerCase()}`, `Weekly ${model} (7d)`, percent, entry['resets_at']))
  }
  return windows
}

/**
 * Codex's wham answer: `rate_limit.primary_window`/`secondary_window` under
 * the account's plan, with the code-review and spark families attached when
 * the account reports them.
 */
function codexWindows(data: Record<string, unknown>): AuthorizationQuotaWindow[] {
  const windows: AuthorizationQuotaWindow[] = []
  const rateLimit = objectOf(data['rate_limit']) ?? objectOf(data['rate_limits']) ?? data
  const primary = objectOf(rateLimit['primary_window']) ?? objectOf(rateLimit['primary'])
  if (primary !== undefined) {
    windows.push(windowOf('five-hour', 'Session (5h)',
      numberOf(primary['used_percent']) ?? numberOf(primary['percent_used']),
      primary['reset_at'] ?? primary['resets_at'] ?? primary['resetAt']))
  }
  const secondary = objectOf(rateLimit['secondary_window']) ?? objectOf(rateLimit['secondary'])
  if (secondary !== undefined) {
    windows.push(windowOf('seven-day', 'Weekly (7d)',
      numberOf(secondary['used_percent']) ?? numberOf(secondary['percent_used']),
      secondary['reset_at'] ?? secondary['resets_at'] ?? secondary['resetAt']))
  }
  const byLimitId = objectOf(data['rate_limits_by_limit_id'])
  const extras: Array<[string, string, unknown]> = [
    ['code-review', 'Code review', byLimitId?.['code_review'] ?? byLimitId?.['codex_review'] ?? data['code_review_rate_limit']],
    ['spark', 'Spark', byLimitId?.['gpt-5.3-codex-spark'] ?? data['spark_rate_limit']],
  ]
  for (const [id, label, value] of extras) {
    const family = objectOf(value)
    const inner = objectOf(family?.['primary_window']) ?? family
    const used = numberOf(inner?.['used_percent']) ?? numberOf(inner?.['percent_used'])
    if (used === undefined || inner === undefined) continue
    windows.push(windowOf(id, label, used, inner['reset_at'] ?? inner['resets_at']))
  }
  return windows
}

/** The headers Anthropic's OAuth-scoped endpoints answer to, as Claude Code sends them. */
function anthropicHeaders(access: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${access}`,
    'anthropic-beta': ANTHROPIC_OAUTH_BETA,
    'anthropic-version': '2023-06-01',
    'User-Agent': 'claude-cli/2.1.0 (external, cli)',
  }
}

async function anthropicQuota(
  oauth: OAuthAuth,
  input: { payload: unknown; signal: AbortSignal; persist(payload: unknown): Promise<void> },
): Promise<AuthorizationQuota | undefined> {
  const stored = oauthCredentialOf(input.payload)
  if (stored === undefined) return undefined
  const credential = await accessTokenOf(oauth, stored, input)
  const headers = anthropicHeaders(credential.access)
  const data = objectOf(await probe(ANTHROPIC_USAGE_URL, headers, input.signal))
  if (data === undefined) {
    throw new LlmError('quota endpoint returned no usage object', 'QUOTA_REFUSED')
  }
  // A record written before labels existed learns the account's email from
  // the profile endpoint on its first quota read — `persist` stores only
  // non-secret additions beside the untouched tokens.
  if (stringOf(stored['label']) === undefined && stringOf(stored['email']) === undefined) {
    const profile = objectOf(await probe(ANTHROPIC_PROFILE_URL, headers, input.signal).catch(() => undefined))
    const email = stringOf(objectOf(profile?.['account'])?.['email'])
    if (email !== undefined) await input.persist({ ...credential, label: email })
  }
  const windows = anthropicWindows(data)
  return { windows, fetchedAt: Date.now(), ...windows.length === 0 ? { message: 'Anthropic reported no quota windows.' } : {} }
}

async function codexQuota(
  oauth: OAuthAuth,
  input: { payload: unknown; signal: AbortSignal; persist(payload: unknown): Promise<void> },
): Promise<AuthorizationQuota | undefined> {
  const stored = oauthCredentialOf(input.payload)
  if (stored === undefined) return undefined
  const credential = await accessTokenOf(oauth, stored, input)
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${credential.access}`,
    'Accept': 'application/json',
    'OpenAI-Beta': 'codex-1',
    'originator': 'codex_cli_rs',
  }
  const accountId = stringOf(credential['accountId'])
  if (accountId !== undefined) headers['ChatGPT-Account-ID'] = accountId
  const data = objectOf(await probe(CODEX_USAGE_URL, headers, input.signal))
  if (data === undefined) {
    throw new LlmError('quota endpoint returned no usage object', 'QUOTA_REFUSED')
  }
  const plan = stringOf(data['plan_type']) ?? stringOf(objectOf(data['summary'])?.['plan'])
  const windows = codexWindows(data)
  return {
    windows,
    fetchedAt: Date.now(),
    ...plan === undefined ? {} : { plan },
    ...windows.length === 0 ? { message: 'Codex reported no quota windows.' } : {},
  }
}

/**
 * Antigravity's quota summary: `groups[].buckets[]` where each bucket names a
 * window (`weekly`, `5h`, `daily`), a `remainingFraction`, and a `resetTime`.
 * Buckets group into the Gemini family and the Claude/GPT family by their
 * group's display name; a disabled session bucket still reports a row (the 5h
 * allowance is parked while a weekly limit stands) but a disabled weekly one
 * is skipped, matching how the IDE's own quota view reads them.
 */
function antigravityWindows(data: Record<string, unknown>): AuthorizationQuotaWindow[] {
  const summary = objectOf(data['quotaSummary'])
  const groups = Array.isArray(data['groups']) ? data['groups']
    : Array.isArray(summary?.['groups']) ? summary['groups']
      : []
  const families: Array<{ pattern: RegExp; id: string; label: string }> = [
    { pattern: /gemini/i, id: 'gemini', label: 'Gemini' },
    { pattern: /claude|gpt/i, id: 'claude-gpt', label: 'Claude & GPT' },
  ]
  const windows: AuthorizationQuotaWindow[] = []
  const taken = new Set<string>()
  for (const entry of groups) {
    const group = objectOf(entry)
    const display = stringOf(group?.['displayName']) ?? ''
    const family = families.find(candidate => candidate.pattern.test(display))
    if (family === undefined) continue
    for (const item of Array.isArray(group?.['buckets']) ? group['buckets'] : []) {
      const bucket = objectOf(item)
      const bucketText = `${stringOf(bucket?.['bucketId']) ?? ''} ${stringOf(bucket?.['displayName']) ?? ''}`.toLowerCase()
      const windowName = stringOf(bucket?.['window'])?.toLowerCase()
      const weekly = windowName === 'weekly' || bucketText.includes('weekly')
      const session = windowName === '5h' || windowName === 'daily'
        || bucketText.includes('five hour') || bucketText.includes('5h') || bucketText.includes('daily')
      if (!weekly && !session) continue
      if (weekly && bucket?.['disabled'] === true) continue
      const kind = weekly ? 'weekly' : 'five-hour'
      if (taken.has(`${family.id}:${kind}`)) continue
      const remaining = numberOf(bucket?.['remainingFraction'])
      if (remaining === undefined) continue
      taken.add(`${family.id}:${kind}`)
      const used = bucket?.['disabled'] === true ? 100 : Math.round((1 - remaining) * 100)
      windows.push(windowOf(`${family.id}-${kind}`, `${family.label} ${weekly ? '(Weekly)' : '(5h)'}`,
        used, bucket?.['resetTime']))
    }
  }
  return windows
}

async function antigravityQuota(
  oauth: OAuthAuth,
  input: { payload: unknown; signal: AbortSignal; persist(payload: unknown): Promise<void> },
): Promise<AuthorizationQuota | undefined> {
  const stored = oauthCredentialOf(input.payload)
  if (stored === undefined) return undefined
  const credential = await accessTokenOf(oauth, stored, input)
  const project = stringOf(credential['projectId'])
  const response = await fetch(ANTIGRAVITY_QUOTA_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${credential.access}`,
      'Content-Type': 'application/json',
      'User-Agent': ANTIGRAVITY_IDE_USER_AGENT,
      'X-Client-Name': 'antigravity',
      'X-Client-Version': '2.22.0',
    },
    body: JSON.stringify(project === undefined ? {} : { project }),
    signal: input.signal,
    redirect: 'error',
  })
  if (!response.ok) {
    throw new LlmError(`quota endpoint answered ${String(response.status)}`, 'QUOTA_REFUSED')
  }
  const data = objectOf(await response.json())
  if (data === undefined) {
    throw new LlmError('quota endpoint returned no usage object', 'QUOTA_REFUSED')
  }
  const windows = antigravityWindows(data)
  return { windows, fetchedAt: Date.now(), ...windows.length === 0 ? { message: 'Antigravity reported no quota windows.' } : {} }
}

/** The providers this adapter can probe for quota — those whose usage endpoint the account's own OAuth grant answers. */
const QUOTA_PROBES: Readonly<Record<string, (oauth: OAuthAuth, input: {
  payload: unknown
  signal: AbortSignal
  persist(payload: unknown): Promise<void>
}) => Promise<AuthorizationQuota | undefined>>> = {
  'anthropic': anthropicQuota,
  'openai-codex': codexQuota,
  'antigravity': antigravityQuota,
}

/**
 * The `quota` implementation for one catalog provider's authorization flow,
 * or `undefined` when the provider's subscription answers no usage endpoint
 * this adapter knows — the seam then reports quota as unavailable rather than
 * guessing.
 * @param provider - the installed catalog provider the flow serves.
 * @returns the flow member to register.
 */
export function quotaProbe(provider: Provider): AuthorizationFlow['quota'] {
  const probeFor = QUOTA_PROBES[provider.id]
  const oauth = provider.auth.oauth
  if (probeFor === undefined || oauth === undefined) return undefined
  return input => probeFor(oauth, input)
}

/**
 * The fields a provider's own endpoint can add to a freshly committed grant.
 * Anthropic's OAuth answer is the bare token triple — no account identity —
 * so its first profile read fills `label`, giving the seam's same-account
 * dedup and the surfaces' account names something to read from sign-in on.
 * Other providers' logins already persist their identity. The read is
 * best-effort: an unreachable endpoint answers `undefined` rather than
 * failing the sign-in whose credential already committed.
 * @param providerId - the provider the record belongs to.
 * @param payload - the grant payload login just stored.
 * @param signal - the attempt's abort signal.
 * @returns fields to merge into the record, or `undefined` when none apply.
 */
export async function grantIdentityFields(
  providerId: string,
  payload: unknown,
  signal: AbortSignal,
): Promise<Record<string, unknown> | undefined> {
  if (providerId !== 'anthropic') return undefined
  const credential = oauthCredentialOf(payload)
  if (credential === undefined
    || stringOf(credential['label']) !== undefined
    || stringOf(credential['email']) !== undefined) return undefined
  const profile = objectOf(await probe(ANTHROPIC_PROFILE_URL, anthropicHeaders(credential.access), signal)
    .catch(() => undefined))
  const email = stringOf(objectOf(profile?.['account'])?.['email'])
  return email === undefined ? undefined : { label: email }
}

/**
 * The account description a flow's stored record carries, when it carries
 * one: a stored `label`/`email` first (what a quota probe or the login
 * enrichment wrote), then the credential's own identity claims — Codex
 * access tokens are JWTs whose profile claim names the ChatGPT account.
 * `identity` is the seam's dedup key — Codex's `accountId` where present,
 * the account's email otherwise, lowercased — and `expiresAt` reports the
 * stored access token's own expiry so a surface can flag a stale sign-in.
 * @param providerId - the provider the record belongs to.
 * @param record - a stored record under the flow's key or an account key.
 * @returns the description the seam reports; empty when nothing names the account.
 */
export function describeGrant(
  providerId: string,
  record: CredentialRecord,
): { label?: string; identity?: string; expiresAt?: number } {
  if (record.kind !== 'grant') return {}
  const fields = objectOf(record.payload)
  if (fields === undefined) return {}
  const expiresAt = numberOf(fields['expires'])
  const stored = stringOf(fields['label']) ?? stringOf(fields['email'])
  if (providerId === 'openai-codex') {
    const claims = jwtClaims(stringOf(fields['access']))
    const email = stringOf(claims?.['email'])
      ?? stringOf(objectOf(claims?.['https://api.openai.com/profile'])?.['email'])
    const accountId = stringOf(fields['accountId'])
    const label = stored ?? email ?? accountId
    // The ChatGPT account id is the stable identity; a stored label or the
    // token's email claim stands in for records that predate its storage.
    const identity = accountId === undefined ? (stored ?? email)?.toLowerCase() : `chatgpt:${accountId}`
    return {
      ...label === undefined ? {} : { label },
      ...identity === undefined ? {} : { identity },
      ...expiresAt === undefined ? {} : { expiresAt },
    }
  }
  return {
    ...stored === undefined ? {} : { label: stored, identity: stored.toLowerCase() },
    ...expiresAt === undefined ? {} : { expiresAt },
  }
}
