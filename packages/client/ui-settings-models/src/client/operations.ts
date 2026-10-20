/**
 * The Host reads and writes the Models cards perform, as callbacks built in the
 * plugin body. Cards receive these instead of a context: the outcomes name what
 * a card renders — a stored view, a stale revision, a refusal message — so the
 * failure codes and Remote namespaces stay in the apply world.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {
  AuthorizationNotice, AuthorizationPromptView, AuthorizationQuota,
  LlmDiscoveredModel, LlmModelDiscoveryRequest,
  SettingsNamespaceView, SettingsPathOpView,
} from '@deepseek-ai/dsh-api-remotes/client'

/** What one namespace write answered. */
export type SettingsWriteOutcome =
  /** Committed; the view carries the stored user subtree and the new revision. */
  | { readonly kind: 'written'; readonly view: SettingsNamespaceView }
  /**
   * The stored revision moved after the card read it, so the draft is stale.
   * The message stays for callers that report the Host diagnostic as it is.
   */
  | { readonly kind: 'conflict'; readonly message: string }
  /** Any other refusal, with the Host's own diagnostic. */
  | { readonly kind: 'refused'; readonly message: string }

/** What one endpoint interrogation answered. */
export type ModelDiscoveryOutcome =
  /** The candidates the provider disclosed, in its own order. */
  | { readonly kind: 'found'; readonly models: readonly LlmDiscoveredModel[] }
  /** The interrogation was refused, with the Host's own diagnostic. */
  | { readonly kind: 'refused'; readonly message: string }

/** The callbacks an authorization attempt relays its conversation through. */
export interface AuthorizationHandlers {
  /** A flow reported progress or an instruction. */
  notice(notice: AuthorizationNotice): void
  /** A flow is waiting on an answer; `promptId` is the handle the answer names. */
  prompt(promptId: string, prompt: AuthorizationPromptView): void
  /** A surfaced prompt closed without an answer — the flow retired the question. */
  promptWithdrawn(promptId: string): void
}

/** What one authorization attempt answered. */
export type AuthorizationOutcomeView =
  /** The record committed; pushed invalidations refresh the card. */
  | { readonly kind: 'authorized' }
  /** The human or the surface withdrew; nothing to report. */
  | { readonly kind: 'cancelled' }
  /** The attempt refused or the flow failed, with the Host's own diagnostic. */
  | { readonly kind: 'failed'; readonly message: string }

/** What one account quota probe answered. */
export type AuthorizationQuotaOutcome =
  /** The provider reported its quota windows. */
  | { readonly kind: 'reported'; readonly quota: AuthorizationQuota }
  /** The flow offers no quota probe, or the account is a plain key — not an error. */
  | { readonly kind: 'unavailable' }
  /** The probe was refused, with the Host's own diagnostic. */
  | { readonly kind: 'refused'; readonly message: string }

/** The Host operations the Models page and its cards invoke. */
export interface ModelsOperations {
  /**
   * Store one credential literal under its reference.
   * @param ref - credential reference name.
   * @param value - the literal to store.
   * @returns the refusal message, or undefined once stored.
   */
  storeCredential(ref: string, value: string): Promise<string | undefined>
  /**
   * Remove one credential reference (idempotent).
   * @param ref - credential reference name.
   * @returns the refusal message, or undefined once removed.
   */
  removeCredential(ref: string): Promise<string | undefined>
  /**
   * Apply path operations to one settings namespace.
   * @param ns - settings namespace identity.
   * @param ops - ordered path operations against the stored section, as the
   * wire takes them (the Remote signature owns the array).
   * @param expectedRevision - revision the draft was opened at, or undefined to write unfenced.
   * @returns the write outcome the card renders from.
   */
  writeSettings(
    ns: string,
    ops: SettingsPathOpView[],
    expectedRevision: number | undefined,
  ): Promise<SettingsWriteOutcome>
  /**
   * Ask a provider endpoint what models it serves.
   * @param settingsNs - namespace whose adapter family answers.
   * @param request - endpoint facts as the form currently shows them.
   * @returns the candidates, or the refusal.
   */
  discoverModels(settingsNs: string, request: LlmModelDiscoveryRequest): Promise<ModelDiscoveryOutcome>
  /**
   * Run one authorization attempt to its settlement, relaying the flow's
   * notices and prompts through `handlers` — they are the attempt's, because
   * only the surface that started it may answer its questions. The attempt's
   * own events stop the moment this promise resolves.
   * @param key - the credential record to authorize (the entry's own `key`).
   * @param method - the flow's method id the surface picked.
   * @param account - the account slot to authorize into; `undefined` writes the base record.
   * @param handlers - where this attempt's notices and prompts go.
   * @returns how the attempt ended; `failed` carries the Host's diagnostic.
   */
  beginAuthorization(
    key: string,
    method: string,
    account: string | undefined,
    handlers: AuthorizationHandlers,
  ): Promise<AuthorizationOutcomeView>
  /**
   * Choose which stored account a flow's requests resolve to.
   * @param key - the flow's credential key.
   * @param account - the account slot to select; `''` selects the base record.
   * @returns the refusal message, or undefined once selected.
   */
  selectAuthorizationAccount(key: string, account: string): Promise<string | undefined>
  /**
   * Ask a flow for one account's provider quota.
   * @param key - the flow's credential key.
   * @param account - the account slot to probe; `undefined` resolves the selected account.
   * @returns the quota answer the card renders from.
   */
  authorizationQuota(key: string, account: string | undefined): Promise<AuthorizationQuotaOutcome>
  /**
   * Deliver the typed or chosen answer to a waiting prompt; a settled or
   * withdrawn prompt ignores the answer.
   * @param promptId - the handle the `authorization/prompt` event carried.
   * @param value - the answer text or option id.
   */
  answerAuthorizationPrompt(promptId: string, value: string): void
  /**
   * Tell a waiting prompt the human dismissed it; the attempt then settles as
   * `cancelled`, because a refusal is not a breakage.
   * @param promptId - the handle the `authorization/prompt` event carried.
   */
  declineAuthorizationPrompt(promptId: string): void
  /**
   * Withdraw the attempt running for a key — the surface's Cancel. The
   * attempt's `begin` then settles as `cancelled`.
   * @param key - the credential record whose attempt should stop.
   */
  cancelAuthorization(key: string): void
  /**
   * Remove the credential record a sign-in stored (idempotent).
   * @param key - the credential record to remove.
   * @returns the refusal message, or undefined once removed.
   */
  signOutAuthorization(key: string): Promise<string | undefined>
}

/**
 * Bind the page's Host operations to the plugin's own Remote namespaces.
 * @param ctx - the page plugin's context, which declares `remote.credentials`,
 * `remote.llm`, `remote.settings`, and `remote.authorization` in its own `inject`.
 * @returns the callbacks the section and its cards are injected with.
 */
export function createModelsOperations(ctx: ClientContext): ModelsOperations {
  /**
   * Live attempts by credential key, owning their interaction callbacks. An
   * entry exists only between a `begin` call and its settlement, so an event
   * that arrives without one belongs to an attempt this surface did not start
   * and is not its concern.
   */
  const attempts = new Map<string, AuthorizationHandlers>()
  ctx.effect(() => {
    const disposers = [
      ctx.remote.$on('authorization/notice', ({ key, notice }) => {
        attempts.get(key)?.notice(notice)
      }),
      ctx.remote.$on('authorization/prompt', ({ key, promptId, prompt }) => {
        attempts.get(key)?.prompt(promptId, prompt)
      }),
      ctx.remote.$on('authorization/prompt-withdrawn', ({ key, promptId }) => {
        attempts.get(key)?.promptWithdrawn(promptId)
      }),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'ui-settings-models: authorization attempt interaction')
  return {
    storeCredential: async (ref, value) => {
      const response = await ctx.remote.credentials.set(ref, value)
      return response.ok ? undefined : response.error.message
    },
    removeCredential: async (ref) => {
      const response = await ctx.remote.credentials.unset(ref)
      return response.ok ? undefined : response.error.message
    },
    writeSettings: async (ns, ops, expectedRevision) => {
      const response = await ctx.remote.settings.mutate(ns, ops, expectedRevision)
      if (response.ok) return { kind: 'written', view: response.value }
      const { code, message } = response.error
      return code === 'settings/conflict' ? { kind: 'conflict', message } : { kind: 'refused', message }
    },
    discoverModels: async (settingsNs, request) => {
      const response = await ctx.remote.llm.discoverModels(settingsNs, request)
      return response.ok
        ? { kind: 'found', models: response.value }
        : { kind: 'refused', message: response.error.message }
    },
    beginAuthorization: async (key, method, account, handlers) => {
      attempts.set(key, handlers)
      try {
        const response = await ctx.remote.authorization.begin(key, method, account)
        if (!response.ok) return { kind: 'failed', message: response.error.message }
        return response.value.status === 'authorized' ? { kind: 'authorized' } : { kind: 'cancelled' }
      } catch (error: unknown) {
        // A rejected promise means the transport dropped the call — the
        // attempt's own settlement never arrived to classify.
        return { kind: 'failed', message: error instanceof Error ? error.message : String(error) }
      } finally {
        attempts.delete(key)
      }
    },
    selectAuthorizationAccount: async (key, account) => {
      const response = await ctx.remote.authorization.selectAccount(key, account)
      return response.ok ? undefined : response.error.message
    },
    authorizationQuota: async (key, account) => {
      const response = await ctx.remote.authorization.quota(key, account)
      if (!response.ok) return { kind: 'refused', message: response.error.message }
      return response.value === undefined
        ? { kind: 'unavailable' }
        : { kind: 'reported', quota: response.value }
    },
    answerAuthorizationPrompt: (promptId, value) => {
      void ctx.remote.authorization.answer(promptId, value)
    },
    declineAuthorizationPrompt: (promptId) => {
      void ctx.remote.authorization.decline(promptId)
    },
    cancelAuthorization: (key) => {
      void ctx.remote.authorization.cancel(key)
    },
    signOutAuthorization: async (key) => {
      const response = await ctx.remote.authorization.signOut(key)
      return response.ok ? undefined : response.error.message
    },
  }
}
