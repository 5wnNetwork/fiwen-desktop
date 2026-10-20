/**
 * Host owner of the `authorization` Remote namespace: the interactive half of
 * `ctx.authorization` as a provider-settings page drives it. Notices and
 * prompts ride the forwarded-event channel; answers, cancellation, and the
 * attempt's own outcome come back through these methods. Grant material never
 * crosses here — the only values that travel are what the human types into a
 * prompt.
 *
 * @module @deepseek-ai/dsh-api-settings-controller/src/authorization.ts
 */

import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { AuthorizationDeclinedError, AuthorizationError } from '@deepseek-ai/dsh-authorization'
import type {
  AuthorizationInteraction, AuthorizationOutcome, AuthorizationService,
} from '@deepseek-ai/dsh-authorization'
import type {
  AuthorizationAccountView, AuthorizationEntry, AuthorizationPrompt, AuthorizationPromptView,
  AuthorizationQuota,
} from '@deepseek-ai/dsh-authorization/types'
import { parseCredentialKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialKey, CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import { parseRequest } from './requests.ts'
import type { AuthorizationDescribeView, AuthorizationEntryView } from './types.ts'

const keyRequestSchema = z.object({ key: z.string().min(1).max(512) })
const beginRequestSchema = keyRequestSchema.extend({
  method: z.string().min(1).optional(),
  // `''` never reaches begin: an unnamed account authorizes the base record.
  account: z.string().min(1).max(128).optional(),
})
const accountRequestSchema = keyRequestSchema.extend({ account: z.string().max(128) })
const quotaRequestSchema = keyRequestSchema.extend({ account: z.string().max(128).optional() })
const answerRequestSchema = z.object({ promptId: z.string().min(1).max(128), value: z.string().max(64 * 1024) })
const declineRequestSchema = z.object({ promptId: z.string().min(1).max(128) })

/**
 * Brand one wire-supplied record key or refuse it. The grammar rejects
 * anything `credentialKey` would not mint, which is the only check a record
 * address needs — an unknown but well-formed key just has no flow.
 */
function brandedKey(method: string, key: string): CredentialKey {
  try {
    return parseCredentialKey(key)
  } catch (error: unknown) {
    throw new RemoteError('gateway/bad-request', `invalid credential key for ${method}`, {}, { cause: error })
  }
}

/**
 * Copy exactly the fields {@link AuthorizationEntryView} declares. The Gateway
 * returns a business result without decoding it, so a flow whose entry carried
 * extra enumerable properties would otherwise serialize them to the caller.
 */
function entryView(entry: AuthorizationEntry, configured: boolean): AuthorizationEntryView {
  return {
    key: entry.key,
    label: entry.label,
    methods: entry.methods.map(method => ({ id: method.id, label: method.label })),
    inFlight: entry.inFlight,
    configured,
  }
}

/** The wire-safe half of one prompt: everything but its withdrawal signal. */
function promptView(prompt: AuthorizationPrompt): AuthorizationPromptView {
  const { signal: _signal, ...view } = prompt
  return view
}

/** A prompt the surface is still expected to answer. */
interface PendingPrompt {
  readonly key: CredentialKey
  readonly resolve: (value: string) => void
  readonly reject: (error: unknown) => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `authorization` Remote namespace. */
    authorizationController: AuthorizationController
  }
}

/**
 * Host service backing the generated `ctx.remote.authorization` namespace. It
 * turns the seam's request-scoped {@link AuthorizationInteraction} into the
 * wire conversation: each `begin` relays the flow's notices and prompts as
 * `authorization/notice` / `authorization/prompt` events, and `answer` /
 * `decline` resolve the pending prompt the surface names by its minted id.
 * Single-flight per key stays with the seam — a second `begin` while one runs
 * fails as `authorization/rejected`, and `cancel` is how a surface whose own
 * request is still open withdraws it.
 */
export class AuthorizationController extends TypertRemoteService {
  /**
   * Prompts awaiting an answer, by minted id. The id is unguessable, so a
   * caller that did not see the `authorization/prompt` broadcast has no
   * handle to answer with.
   */
  private readonly pendingPrompts = new Map<string, PendingPrompt>()

  /** @param ctx - Host context where the authorization and credential services may be mounted. */
  constructor(ctx: Context) {
    super(ctx, 'authorizationController', { namespace: 'authorization' })
  }

  /**
   * Every registered flow with its stored-credential state, for a surface
   * listing what can be authorized.
   * @returns one view per flow, in registration order.
   * @throws RemoteError when no authorization or credential service is mounted.
   */
  @Remote
  async list(): Promise<AuthorizationEntryView[]> {
    const entries = this.provider().list()
    return Promise.all(entries.map(async entry => entryView(entry, await this.configured(entry.key))))
  }

  /**
   * One record's flow and stored-credential state. The `configured` half
   * answers independently of `entry` on purpose: a stored grant whose flow's
   * plugin is gone is still a credential the surface can let the user sign out.
   * @param key - the credential record to describe; malformed keys reject as `gateway/bad-request`.
   * @returns the key, its flow view when registered, and its stored state.
   * @throws RemoteError when the request is invalid or a required service is absent.
   */
  @Remote
  async describe(key: string): Promise<AuthorizationDescribeView> {
    const branded = brandedKey('authorization.describe', parseRequest('authorization.describe', keyRequestSchema, { key }).key)
    const entry = this.provider().describe(branded)
    const configured = await this.configured(branded)
    return { key: branded, configured, ...entry === undefined ? {} : { entry: entryView(entry, configured) } }
  }

  /**
   * Every account a flow has stored, for an account-management surface.
   * @param key - the flow's record key.
   * @returns one view per stored account record, base record first.
   * @throws RemoteError `authorization/rejected` when no flow claims the key.
   */
  @Remote
  async listAccounts(key: string): Promise<readonly AuthorizationAccountView[]> {
    const branded = brandedKey('authorization.listAccounts', parseRequest('authorization.listAccounts', keyRequestSchema, { key }).key)
    // Resolved outside the failure classification: a missing service is
    // gateway/internal, not an authorization refusal.
    const authorization = this.provider()
    try {
      return await authorization.listAccounts(branded)
    } catch (error: unknown) {
      throw rejected(branded, error)
    }
  }

  /**
   * Choose which stored account a flow's requests resolve to.
   * @param key - the flow's record key.
   * @param account - the account slot to select; `''` selects the base record.
   * @throws RemoteError `authorization/rejected` when no flow claims the key,
   *   the slot is malformed, or no record is stored under it.
   */
  @Remote
  async selectAccount(key: string, account: string): Promise<void> {
    const request = parseRequest('authorization.selectAccount', accountRequestSchema, { key, account })
    const branded = brandedKey('authorization.selectAccount', request.key)
    const authorization = this.provider()
    try {
      await authorization.selectAccount(branded, request.account)
    } catch (error: unknown) {
      throw rejected(branded, error)
    }
  }

  /**
   * Ask a flow for one stored account's provider quota.
   * @param key - the flow's record key.
   * @param account - the account slot to probe; `''` is the base record, absent resolves the selection.
   * @param signal - caller lifetime; aborting abandons the probe.
   * @returns the normalized quota, or `undefined` when the flow offers none or nothing is stored.
   * @throws RemoteError `authorization/rejected` when no flow claims the key or the slot is malformed.
   */
  @Remote
  async quota(key: string, account: string | undefined, signal: AbortSignal): Promise<AuthorizationQuota | undefined> {
    const request = parseRequest('authorization.quota', quotaRequestSchema, { key, account })
    const branded = brandedKey('authorization.quota', request.key)
    const authorization = this.provider()
    try {
      return await authorization.quota(branded, request.account, signal)
    } catch (error: unknown) {
      throw rejected(branded, error)
    }
  }

  /**
   * Run one attempt to authorize a key, returning when it settles. The call
   * stays open for the whole conversation: notices and prompts arrive as the
   * forwarded events while it runs, the caller's own signal withdrawing the
   * attempt when the connection drops or the caller cancels it.
   * @param key - the credential record to authorize.
   * @param method - which of the flow's methods to run; `undefined` runs its first.
   * @param account - the account slot to authorize into; `undefined` writes the base record.
   * @param signal - caller lifetime; aborting withdraws the attempt.
   * @returns `authorized` once the record is committed, `cancelled` when the human declined or withdrew.
   * @throws RemoteError `authorization/rejected` when no flow claims the key, the method is
   *   unknown, the account slot is malformed, an attempt is already running, or the flow fails.
   */
  @Remote
  async begin(key: string, method: string | undefined, account: string | undefined, signal: AbortSignal): Promise<AuthorizationOutcome> {
    const request = parseRequest('authorization.begin', beginRequestSchema, { key, method, account })
    const branded = brandedKey('authorization.begin', request.key)
    // Resolved outside the failure classification: a missing service is
    // gateway/internal, not an authorization refusal.
    const authorization = this.provider()
    const interaction: AuthorizationInteraction = {
      notify: (notice) => { this.ctx.emit('authorization/notice', { key: branded, notice }) },
      prompt: prompt => this.ask(branded, prompt),
    }
    try {
      return await authorization.begin({
        key: branded,
        ...request.method === undefined ? {} : { method: request.method },
        ...request.account === undefined ? {} : { account: request.account },
        interaction,
        signal,
      })
    } catch (error: unknown) {
      throw rejected(branded, error)
    } finally {
      // The attempt is over: any prompt still open can never be answered, and
      // leaving it would hold its flow-side caller and mislead a later answer.
      this.settlePrompts(branded, new AuthorizationError('the authorization attempt ended', 'SETTLED'))
    }
  }

  /**
   * Deliver the human's answer to a waiting prompt.
   * @param promptId - the handle from `authorization/prompt`.
   * @param value - the typed text, or the chosen option's id.
   * @returns whether a prompt was still waiting for the id; `false` means it
   *   settled or was withdrawn first, which is an outcome, not a failure.
   */
  @Remote
  answer(promptId: string, value: string): boolean {
    const request = parseRequest('authorization.answer', answerRequestSchema, { promptId, value })
    const pending = this.pendingPrompts.get(request.promptId)
    if (pending === undefined) return false
    this.pendingPrompts.delete(request.promptId)
    pending.resolve(request.value)
    return true
  }

  /**
   * Tell a waiting prompt the human declined it.
   * @param promptId - the handle from `authorization/prompt`.
   * @returns whether a prompt was still waiting for the id.
   */
  @Remote
  decline(promptId: string): boolean {
    const request = parseRequest('authorization.decline', declineRequestSchema, { promptId })
    const pending = this.pendingPrompts.get(request.promptId)
    if (pending === undefined) return false
    this.pendingPrompts.delete(request.promptId)
    pending.reject(new AuthorizationDeclinedError())
    return true
  }

  /**
   * Withdraw the attempt running for a key. The request/response transport
   * answers a Cancel control on a second call, which has no handle on the
   * first call's signal.
   * @param key - the credential record whose attempt should stop.
   * @throws RemoteError when the request is invalid or no authorization service is mounted.
   */
  @Remote
  cancel(key: string): void {
    const branded = brandedKey('authorization.cancel', parseRequest('authorization.cancel', keyRequestSchema, { key }).key)
    this.provider().cancel(branded)
  }

  /**
   * Remove one stored credential record — the surface's "sign out". Removing
   * an absent record is a no-op.
   * @param key - the credential record to remove.
   * @throws RemoteError when the request is invalid, no credential service is mounted, or the store refuses.
   */
  @Remote
  async signOut(key: string): Promise<void> {
    const branded = brandedKey('authorization.signOut', parseRequest('authorization.signOut', keyRequestSchema, { key }).key)
    const credentials = this.credentialProvider()
    try {
      await credentials.deleteRecord(branded)
    } catch (error: unknown) {
      throw rejected(branded, error)
    }
  }

  /**
   * Put one flow question to the surface and park the answer. The minted
   * `promptId` rides the `authorization/prompt` broadcast; `answer` /
   * `decline` / the prompt's own `signal` settle it, and the attempt's end
   * settles whatever remains so no flow-side waiter outlives its attempt.
   */
  private ask(key: CredentialKey, prompt: AuthorizationPrompt): Promise<string> {
    const promptId = `ap-${randomUUID()}`
    return new Promise<string>((resolve, reject) => {
      this.pendingPrompts.set(promptId, { key, resolve, reject })
      const withdraw = (): void => {
        if (!this.pendingPrompts.delete(promptId)) return
        this.ctx.emit('authorization/prompt-withdrawn', { key, promptId })
        // Not a decline — a flow retiring its own question. Rejecting with
        // AuthorizationDeclinedError would read as the human saying no and
        // cancel an attempt the flow is still running.
        reject(new AuthorizationError('the authorization prompt was withdrawn by its flow', 'WITHDRAWN'))
      }
      if (prompt.signal !== undefined) {
        if (prompt.signal.aborted) { withdraw(); return }
        prompt.signal.addEventListener('abort', withdraw, { once: true })
      }
      this.ctx.emit('authorization/prompt', { key, promptId, prompt: promptView(prompt) })
    })
  }

  /** Fail every prompt one attempt left open, so no answer handle outlives it. */
  private settlePrompts(key: CredentialKey, error: AuthorizationError): void {
    for (const [promptId, pending] of this.pendingPrompts) {
      if (pending.key !== key) continue
      this.pendingPrompts.delete(promptId)
      pending.reject(error)
    }
  }

  /**
   * The stored-credential fact for one key. A key a flow claims answers "any
   * account resolves": a provider that signed two users in holds account
   * records, never the base record `describeRecord` would check. A key with
   * no flow still answers its own record's presence, so an orphaned record
   * stays sign-out-able.
   */
  private async configured(key: CredentialKey): Promise<boolean> {
    const authorization = this.ctx.get('authorization')
    if (authorization !== undefined && authorization.describe(key) !== undefined) {
      return (await authorization.listAccounts(key)).length > 0
    }
    return (await this.credentialProvider().describeRecord(key)).configured
  }

  /** Resolve the authorization service or report how to supply it. */
  private provider(): AuthorizationService {
    const authorization = this.ctx.get('authorization')
    if (authorization === undefined) {
      throw new RemoteError(
        'gateway/internal',
        'authorization service is absent: this deployment does not mount @deepseek-ai/dsh-authorization in its composition',
        {},
      )
    }
    return authorization
  }

  /** Resolve the credential provider or report how to supply it. */
  private credentialProvider(): CredentialProvider {
    const credentials = this.ctx.get('credentials')
    if (credentials === undefined) {
      throw new RemoteError(
        'gateway/internal',
        'credentials service is absent: this deployment does not mount a credential provider (e.g. @deepseek-ai/dsh-credentials-local) in its composition',
        {},
      )
    }
    return credentials
  }
}

/**
 * Classify one seam refusal: an unknown flow or method, a busy key, or the
 * flow's own failure all reach the caller as `authorization/rejected` with the
 * seam's message — the text a surface shows verbatim. The details name only
 * the record key, so no failure path can carry grant material back out.
 */
function rejected(key: CredentialKey, error: unknown): RemoteError {
  return new RemoteError(
    'authorization/rejected',
    error instanceof Error ? error.message : String(error),
    { key: String(key) },
    { cause: error },
  )
}

export default AuthorizationController
