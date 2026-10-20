/**
 * The Antigravity provider: the subscription Code Assist surface Google's
 * Antigravity IDE talks to. Sign-in is Google's OAuth authorization-code
 * flow against the IDE's own public client — the scopes it requests
 * (`cloud-platform`, `cclog`, `experimentsandconfigs`) are bound to that
 * client's project, so a third-party client cannot mint its own; every
 * implementation in this ecosystem uses the published pair — followed by
 * Code Assist project discovery (`loadCodeAssist`) and onboarding
 * (`onboardUser`) on the production host. Chat traffic itself goes to the
 * daily host through {@link module:dsh-llm-pi-ai/antigravity-stream}.
 *
 * The sign-in doubles as the project-discovery point: the access token gets
 * an email from `userinfo`, then `loadCodeAssist` returns the
 * `cloudaicompanionProject` (or `allowedTiers` to onboard against when the
 * account was never provisioned), and the grant stores `projectId` and
 * `email` beside the tokens so quota checks and streams resolve the same
 * project without calling discovery again.
 *
 * @module dsh-llm-pi-ai/antigravity
 */

import { randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { arch, platform } from 'node:os'
import type { AddressInfo } from 'node:net'
import type { OAuthCredential, Provider, ProviderAuthInteraction } from '@earendil-works/pi-ai'
import { oauthErrorHtml, oauthSuccessHtml } from '@earendil-works/pi-ai/utils/oauth-page'
import { LlmError } from '@deepseek-ai/dsh-llm'
import {
  ANTIGRAVITY_ACCOUNT_HEADER,
  ANTIGRAVITY_DAILY_HOST,
  ANTIGRAVITY_IDE_USER_AGENT,
  ANTIGRAVITY_PROJECT_HEADER,
  antigravityStream,
  antigravityStreamSimple,
} from './antigravity-stream.ts'

/** This provider's catalog id — the route key profiles and flows name. */
export const ANTIGRAVITY_PROVIDER_ID = 'antigravity'

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v1/userinfo'
/** Project discovery and onboarding stay on the production host — the daily host refuses them. */
const CODE_ASSIST_PROD = 'https://cloudcode-pa.googleapis.com'

/** The Antigravity IDE's public OAuth client — see the module doc for why a private one is impossible. */
const CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com'
const CLIENT_SECRET = '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'

const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
] as const

/** Stored tokens are written with this much of their lifetime already consumed, so a request never leaves on fumes. */
const EXPIRY_LEAD_MS = 60_000

/** `onboardUser` polls until `done`; provisioning a fresh free-tier account takes a few rounds. */
const ONBOARD_ATTEMPTS = 6
const ONBOARD_DELAY_MS = 5_000

/**
 * The platform enum `loadCodeAssist`/`onboardUser` metadata carries — Google's
 * `Platform` proto values, not process strings.
 */
/* v8 ignore start -- only the row matching the host OS/arch ever executes. */
function platformEnum(): number {
  if (platform() === 'darwin') return arch() === 'arm64' ? 2 : 1
  if (platform() === 'linux') return arch() === 'arm64' ? 4 : 3
  if (platform() === 'win32') return 5
  return 0
}
/* v8 ignore stop */

/** The `ClientMetadata` the discovery calls carry — numeric enum values, as the IDE sends them. */
function clientMetadata(): { ideType: number; platform: number; pluginType: number } {
  return { ideType: 9, platform: platformEnum(), pluginType: 2 }
}

/**
 * The access-token-bearing headers discovery answers to. Deliberately only
 * these: the `X-Goog-Api-Client`/`Client-Metadata` headers gemini-cli sends
 * make Google's backend fingerprint the client as *not* Antigravity and
 * silently refuse to provision a project.
 */
function discoveryHeaders(access: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${access}`,
    'Content-Type': 'application/json',
    'User-Agent': ANTIGRAVITY_IDE_USER_AGENT,
  }
}

/** A discovery call: fixed host, fixed path, no redirects, the caller's abort signal. */
async function postDiscovery(
  operation: 'loadCodeAssist' | 'onboardUser',
  access: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${CODE_ASSIST_PROD}/v1internal:${operation}`, {
    method: 'POST',
    headers: discoveryHeaders(access),
    body: JSON.stringify(body),
    signal,
    redirect: 'error',
  })
  const data = await response.json().catch(() => undefined) as Record<string, unknown> | undefined
  if (!response.ok) {
    throw new LlmError(
      `Antigravity ${operation} answered ${String(response.status)}`, 'DISCOVERY_REFUSED')
  }
  return data ?? {}
}

/**
 * The project id a `loadCodeAssist`/`onboardUser` response carries, in either
 * spelling (`string` or `{id}`), or `undefined` when it carries none.
 */
function projectOf(data: Record<string, unknown> | undefined): string | undefined {
  const project = data?.['cloudaicompanionProject']
  if (typeof project === 'string' && project.length > 0) return project.trim()
  if (typeof project === 'object' && project !== null) {
    const id = (project as { id?: unknown }).id
    if (typeof id === 'string' && id.length > 0) return id.trim()
  }
  return undefined
}

/** The tier to onboard against: the account's default tier, else `legacy-tier`. */
function tierOf(data: Record<string, unknown>): string {
  const tiers = data['allowedTiers']
  if (Array.isArray(tiers)) {
    for (const tier of tiers) {
      if (typeof tier === 'object' && tier !== null
        && (tier as { isDefault?: unknown }).isDefault === true
        && typeof (tier as { id?: unknown }).id === 'string') {
        return (tier as { id: string }).id.trim()
      }
    }
  }
  return 'legacy-tier'
}

/** Sleep bounded by the abort signal — onboarding waits are long enough that cancellation must interrupt them. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal.reason as Error)
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Discover the Code Assist project for a fresh token: `loadCodeAssist` answers
 * it directly for a provisioned account; otherwise `onboardUser` provisions
 * one against the account's default tier and polls until Google reports
 * `done`. When discovery refuses outright (the endpoint is also how
 * ineligible accounts answer), the caller falls back to a generated project
 * id rather than failing the sign-in — upstream clients do the same, since a
 * request sent with a placeholder project is how free-tier traffic works.
 */
async function discoverProject(access: string, signal: AbortSignal): Promise<string> {
  const loaded = await postDiscovery('loadCodeAssist', access, { metadata: clientMetadata() }, signal)
    .catch(() => undefined)
  const direct = projectOf(loaded)
  if (direct !== undefined) return direct
  if (loaded === undefined) return generateProjectId()
  const tierId = tierOf(loaded)
  for (let attempt = 0; attempt < ONBOARD_ATTEMPTS; attempt++) {
    const result = await postDiscovery('onboardUser', access, { tierId, metadata: clientMetadata() }, signal)
    if (result['done'] === true) {
      return projectOf(result['response'] as Record<string, unknown> | undefined) ?? generateProjectId()
    }
    if (attempt + 1 < ONBOARD_ATTEMPTS) await wait(ONBOARD_DELAY_MS, signal)
  }
  return generateProjectId()
}

/** The placeholder project a never-provisioned grant sends — the same shape upstream clients generate. */
function generateProjectId(): string {
  const adjectives = ['useful', 'bright', 'swift', 'calm', 'bold'] as const
  const nouns = ['fuze', 'wave', 'spark', 'flow', 'core'] as const
  const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)] as T
  return `${pick(adjectives)}-${pick(nouns)}-${randomUUID().slice(0, 5)}`
}

/**
 * The loopback half of the authorization-code flow. Listens on an ephemeral
 * loopback port for the provider's redirect, answers the browser with the
 * shared OAuth result page, and resolves the query parameters. Rejects when
 * the provider reports an error, the `state` doesn't match, or the caller's
 * signal aborts the wait.
 */
interface LoopbackCallback {
  port: number
  params: Promise<URLSearchParams>
  close(): void
}

function listenForCallback(state: string, signal: AbortSignal): Promise<LoopbackCallback> {
  return new Promise((resolveListen, rejectListen) => {
    const server = createServer((request, response) => {
      /* v8 ignore next -- an http server's request always carries its url. */
      const url = new URL(request.url ?? '/', 'http://localhost')
      if (url.pathname !== '/callback') {
        response.writeHead(404).end('Not found')
        return
      }
      const params = url.searchParams
      const oauthError = params.get('error')
      const code = params.get('code')
      if (oauthError !== null || code === null || params.get('state') !== state) {
        const reason = oauthError ?? (code === null ? 'missing authorization code' : 'state mismatch')
        response.writeHead(400, { 'Content-Type': 'text/html' })
          .end(oauthErrorHtml('Sign-in failed', reason))
        settleParams(new Error(`Antigravity sign-in did not complete: ${reason}`))
        return
      }
      response.writeHead(200, { 'Content-Type': 'text/html' })
        .end(oauthSuccessHtml('You can close this tab and return to Fiwen.'))
      settleParams(params)
    })
    let settleParams!: (outcome: URLSearchParams | Error) => void
    const params = new Promise<URLSearchParams>((resolveParams, rejectParams) => {
      settleParams = (outcome) => {
        if (outcome instanceof Error) rejectParams(outcome)
        else resolveParams(outcome)
      }
    })
    const close = () => server.close()
    const onAbort = () => {
      close()
      settleParams(signal.reason instanceof Error ? signal.reason : new Error('Sign-in was cancelled'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    params.finally(() => {
      signal.removeEventListener('abort', onAbort)
      close()
    }).catch(() => {})
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo
      resolveListen({ port: address.port, params, close })
    })
    server.on('error', rejectListen)
  })
}

/**
 * Wait for the authorization code from whichever path wins: the browser's
 * loopback redirect, or a code the human pastes when the redirect cannot
 * complete (remote desktop, browser that refuses localhost). The losing path
 * is withdrawn — an aborted prompt rejects, a closed server stops answering.
 */
async function waitForCode(
  callback: LoopbackCallback,
  interaction: ProviderAuthInteraction,
): Promise<string> {
  const withdraw = new AbortController()
  const onAbort = () => { withdraw.abort() }
  interaction.signal.addEventListener('abort', onAbort, { once: true })
  const manual = interaction.prompt({
    type: 'manual_code',
    message: 'If the browser did not return here, paste the authorization code (or the full redirect URL).',
    placeholder: 'authorization code',
    signal: withdraw.signal,
  }).then((value) => {
    const trimmed = value.trim()
    // A pasted redirect URL decodes to the code alone; anything else is taken verbatim.
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const parsed = new URL(trimmed).searchParams.get('code')
      if (parsed !== null) return parsed
    }
    return trimmed
  })
  // The loser's rejection is expected — only the winner's outcome matters.
  const manualSettled = manual.catch((error: unknown) => ({ error }))
  try {
    const winner = await Promise.race([
      callback.params.then(params => ({ code: params.get('code') as string, manual: false })),
      manualSettled.then(outcome => typeof outcome === 'object' ? outcome : { code: outcome, manual: true }),
    ])
    if ('error' in winner) {
      callback.close()
      throw winner.error
    }
    if (!winner.manual) withdraw.abort()
    return winner.code
  } finally {
    interaction.signal.removeEventListener('abort', onAbort)
    withdraw.abort()
  }
}

/** Exchange the authorization code for tokens — the standard Google token request, no PKCE. */
async function exchangeCode(
  code: string,
  redirectUri: string,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
    signal,
    redirect: 'error',
  })
  const data = await response.json().catch(() => undefined) as Record<string, unknown> | undefined
  if (!response.ok) {
    const reason = typeof data?.['error_description'] === 'string' ? data['error_description']
      : typeof data?.['error'] === 'string' ? data['error']
        : `status ${String(response.status)}`
    throw new LlmError(`Antigravity token exchange failed: ${reason}`, 'EXCHANGE_REFUSED')
  }
  if (typeof data?.['access_token'] !== 'string' || typeof data['refresh_token'] !== 'string') {
    throw new LlmError('Antigravity token exchange returned no access/refresh token', 'EXCHANGE_REFUSED')
  }
  return data
}

/** The account's email, best-effort — it labels the stored grant and seeds session ids. */
async function accountEmail(access: string, signal: AbortSignal): Promise<string | undefined> {
  const response = await fetch(`${USERINFO_URL}?alt=json`, {
    headers: { 'Authorization': `Bearer ${access}`, 'Accept': 'application/json' },
    signal,
    redirect: 'error',
  }).catch(() => undefined)
  if (response === undefined || !response.ok) return undefined
  const data = await response.json().catch(() => undefined) as Record<string, unknown> | undefined
  const email = data?.['email']
  return typeof email === 'string' && email.length > 0 ? email : undefined
}

/** The stored expiry for a token response: wall-clock minus the safety lead. */
function expiresAt(data: Record<string, unknown>): number {
  const seconds = typeof data['expires_in'] === 'number' ? data['expires_in'] : 3600
  return Date.now() + seconds * 1000 - EXPIRY_LEAD_MS
}

/**
 * The interactive half of OAuth: loopback callback first, manual code paste
 * racing it, then exchange → account email → project discovery → onboarding.
 * Produces the credential pi-ai stores verbatim under the flow's record.
 */
async function login(interaction: ProviderAuthInteraction): Promise<OAuthCredential> {
  const state = randomBytes(16).toString('hex')
  const callback = await listenForCallback(state, interaction.signal)
  const redirectUri = `http://localhost:${String(callback.port)}/callback`
  try {
    const url = new URL(AUTHORIZE_URL)
    url.searchParams.set('client_id', CLIENT_ID)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', SCOPES.join(' '))
    url.searchParams.set('access_type', 'offline')
    url.searchParams.set('prompt', 'consent')
    url.searchParams.set('state', state)
    interaction.notify({
      type: 'auth_url',
      url: url.toString(),
      instructions: 'Sign in with the Google account your Antigravity subscription is on.',
    })
    const code = await waitForCode(callback, interaction)
    interaction.notify({ type: 'progress', message: 'Exchanging the authorization code…' })
    const tokens = await exchangeCode(code, redirectUri, interaction.signal)
    const access = tokens['access_token'] as string
    interaction.notify({ type: 'progress', message: 'Preparing Code Assist…' })
    const [email, projectId] = await Promise.all([
      accountEmail(access, interaction.signal),
      discoverProject(access, interaction.signal),
    ])
    const scope = tokens['scope']
    return {
      type: 'oauth',
      access,
      refresh: tokens['refresh_token'] as string,
      expires: expiresAt(tokens),
      projectId,
      ...email === undefined ? {} : { email },
      ...typeof scope === 'string' && scope.length > 0 ? { scope } : {},
    }
  } finally {
    callback.close()
  }
}

/**
 * Rotate the access token. Google may return a new refresh token alongside
 * (rotation is supported even though it is rare); whichever arrives is the
 * one persisted. The credential's own fields — `projectId`, `email`, `scope`
 * — ride through untouched.
 */
async function refresh(credential: OAuthCredential, signal: AbortSignal): Promise<OAuthCredential> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: credential.refresh,
      grant_type: 'refresh_token',
    }),
    signal,
    redirect: 'error',
  })
  const data = await response.json().catch(() => undefined) as Record<string, unknown> | undefined
  if (!response.ok || typeof data?.['access_token'] !== 'string') {
    const reason = typeof data?.['error_description'] === 'string' ? data['error_description']
      : typeof data?.['error'] === 'string' ? data['error']
        : `status ${String(response.status)}`
    throw new LlmError(`Antigravity token refresh failed: ${reason}`, 'REFRESH_REFUSED')
  }
  const scope = data['scope']
  return {
    ...credential,
    access: data['access_token'],
    expires: expiresAt(data),
    ...typeof data['refresh_token'] === 'string' ? { refresh: data['refresh_token'] } : {},
    ...typeof scope === 'string' && scope.length > 0 ? { scope } : {},
  }
}

/** One catalog model entry: the clean picker id plus the wire name the tiered upstream expects. */
interface AntigravityModelSpec {
  id: string
  name: string
  /** The id the Code Assist envelope names; defaults to `id`. */
  upstreamId?: string
  contextWindow: number
  image?: boolean
}

const GEMINI_CONTEXT = 1_048_576
const CLAUDE_CONTEXT = 200_000
const GPT_OSS_CONTEXT = 131_072
/** Upstream caps output at 64k regardless of what a model could emit. */
const OUTPUT_TOKENS = 64_000

const ANTIGRAVITY_MODELS: readonly AntigravityModelSpec[] = [
  { id: 'gemini-4-argon-high', name: 'Gemini 4 Argon (High)', upstreamId: 'gemini-4-argon-high(high)', contextWindow: GEMINI_CONTEXT, image: true },
  { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)', upstreamId: 'gemini-3.8-flash-high(high)', contextWindow: GEMINI_CONTEXT, image: true },
  { id: 'gemini-3.8-flash-medium', name: 'Gemini 3.8 Flash (Medium)', upstreamId: 'gemini-3.8-flash-medium(medium)', contextWindow: GEMINI_CONTEXT, image: true },
  { id: 'gemini-3.8-flash-low', name: 'Gemini 3.8 Flash (Low)', upstreamId: 'gemini-3.8-flash-low(low)', contextWindow: GEMINI_CONTEXT, image: true },
  { id: 'gemini-3.7-flash-high', name: 'Gemini 3.7 Flash (High)', upstreamId: 'gemini-3.7-flash-tiered(high)', contextWindow: GEMINI_CONTEXT, image: true },
  { id: 'gemini-3.7-flash-medium', name: 'Gemini 3.7 Flash (Medium)', upstreamId: 'gemini-3.7-flash-tiered(medium)', contextWindow: GEMINI_CONTEXT, image: true },
  { id: 'gemini-3.7-flash-low', name: 'Gemini 3.7 Flash (Low)', upstreamId: 'gemini-3.7-flash-tiered(low)', contextWindow: GEMINI_CONTEXT, image: true },
  { id: 'gemini-3.6-flash-high', name: 'Gemini 3.6 Flash (High)', upstreamId: 'gemini-3.6-flash-tiered(high)', contextWindow: GEMINI_CONTEXT, image: true },
  { id: 'gemini-3.6-flash-medium', name: 'Gemini 3.6 Flash (Medium)', upstreamId: 'gemini-3.6-flash-tiered(medium)', contextWindow: GEMINI_CONTEXT, image: true },
  { id: 'gemini-3.6-flash-low', name: 'Gemini 3.6 Flash (Low)', upstreamId: 'gemini-3.6-flash-tiered(low)', contextWindow: GEMINI_CONTEXT, image: true },
  { id: 'gemini-pro-agent', name: 'Gemini 3.1 Pro (High)', contextWindow: GEMINI_CONTEXT, image: true },
  { id: 'gemini-3.1-pro-low', name: 'Gemini 3.1 Pro (Low)', upstreamId: 'gemini-3.1-pro-low(low)', contextWindow: GEMINI_CONTEXT, image: true },
  { id: 'claude-sonnet-5-5-high', name: 'Claude Sonnet 5.5 (High)', upstreamId: 'claude-sonnet-5-5-high(high)', contextWindow: CLAUDE_CONTEXT, image: true },
  { id: 'claude-sonnet-5-5-medium', name: 'Claude Sonnet 5.5 (Medium)', upstreamId: 'claude-sonnet-5-5-medium(medium)', contextWindow: CLAUDE_CONTEXT, image: true },
  { id: 'claude-sonnet-5-5-low', name: 'Claude Sonnet 5.5 (Low)', upstreamId: 'claude-sonnet-5-5-low(low)', contextWindow: CLAUDE_CONTEXT, image: true },
  { id: 'claude-opus-5-5-high', name: 'Claude Opus 5.5 (High)', upstreamId: 'claude-opus-5-5-high(high)', contextWindow: CLAUDE_CONTEXT, image: true },
  { id: 'claude-opus-5-5-medium', name: 'Claude Opus 5.5 (Medium)', upstreamId: 'claude-opus-5-5-medium(medium)', contextWindow: CLAUDE_CONTEXT, image: true },
  { id: 'claude-opus-5-5-low', name: 'Claude Opus 5.5 (Low)', upstreamId: 'claude-opus-5-5-low(low)', contextWindow: CLAUDE_CONTEXT, image: true },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (Thinking)', contextWindow: CLAUDE_CONTEXT, image: true },
  { id: 'claude-opus-4-6-thinking', name: 'Claude Opus 4.6 (Thinking)', contextWindow: CLAUDE_CONTEXT, image: true },
  { id: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B (Medium)', contextWindow: GPT_OSS_CONTEXT },
]

const MODEL_LIST = ANTIGRAVITY_MODELS.map(spec => ({
  id: spec.id,
  name: spec.name,
  api: 'google-generative-ai' as const,
  provider: ANTIGRAVITY_PROVIDER_ID,
  baseUrl: ANTIGRAVITY_DAILY_HOST,
  input: spec.image === true ? ['text' as const, 'image' as const] : ['text' as const],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  // The thinking tier is baked into the wire id, so the model itself reports
  // no selectable reasoning — the picker entry *is* the effort choice.
  reasoning: false,
  contextWindow: spec.contextWindow,
  maxTokens: OUTPUT_TOKENS,
  ...spec.upstreamId === undefined ? {} : { upstreamId: spec.upstreamId },
}))

/**
 * The Antigravity catalog provider. Chat models only — the image-generation
 * endpoint shares the host but a different request shape, which this
 * implementation does not serve. The model list is static, matching what the
 * IDE ships; upstream `fetchAvailableModels` is intentionally not consulted so
 * the served catalog stays the one this adapter was verified against.
 */
export function antigravityProvider(): Provider {
  return {
    id: ANTIGRAVITY_PROVIDER_ID,
    name: 'Antigravity (Google)',
    baseUrl: ANTIGRAVITY_DAILY_HOST,
    auth: {
      oauth: {
        name: 'Google (Antigravity subscription)',
        isSubscription: true,
        loginLabel: 'Sign in with Google',
        login,
        refresh,
        toAuth: credential => Promise.resolve({
          apiKey: credential.access,
          headers: {
            ...typeof credential['projectId'] === 'string' && credential['projectId'].length > 0
              ? { [ANTIGRAVITY_PROJECT_HEADER]: credential['projectId'] } : {},
            ...typeof credential['email'] === 'string' && credential['email'].length > 0
              ? { [ANTIGRAVITY_ACCOUNT_HEADER]: credential['email'] } : {},
          },
        }),
      },
    },
    getModels: () => MODEL_LIST,
    stream: (model, context, options) => antigravityStream(model, context, options),
    streamSimple: (model, context, options) => antigravityStreamSimple(model, context, options),
  }
}
