/**
 * Wire-safe authorization types, free of cordis/service imports so browser type
 * chains can consume them without loading this
 * package's Context augmentation.
 * @module @deepseek-ai/dsh-authorization/types
 */

import type { CredentialKey } from '@deepseek-ai/dsh-credentials/types'

/** One way a flow can obtain its credential, named by the flow that offers it. */
export interface AuthorizationMethod {
  /** Flow-owned identifier, echoed back when a caller picks this method. */
  id: string
  /** User-facing label for a picker. */
  label: string
}

/** A running flow's report to whoever is watching it. Never carries a secret. */
export interface AuthorizationNotice {
  /** What is happening, or what the human must do next. */
  message: string
  /** A page the human must open to continue. */
  url?: string
  /** A short code the human must enter on that page. */
  code?: string
}

/** One choice offered by a `select` prompt. */
export interface AuthorizationPromptOption {
  /** Value returned when this option is chosen. */
  id: string
  /** User-facing label. */
  label: string
  /** Optional extra context rendered by capable surfaces. */
  description?: string
}

/**
 * A question a flow must have answered before it can continue, as a wire or
 * rendering surface sees it. `secret` differs from `text` only in presentation
 * — a surface masks it and keeps it out of logs — and `select` answers with
 * the chosen option's `id`.
 */
export type AuthorizationPromptView = {
  kind: 'text'
  message: string
  placeholder?: string
} | {
  kind: 'secret'
  message: string
  placeholder?: string
} | {
  kind: 'select'
  message: string
  options: readonly AuthorizationPromptOption[]
}

/** A prompt as its flow sees it: the question plus its own withdrawal signal. */
export type AuthorizationPrompt = {
  /**
   * Withdraws this prompt alone, leaving the flow running. A flow that races a
   * typed code against a browser callback aborts the losing prompt here; the
   * whole authorization is cancelled through the request's signal instead.
   */
  signal?: AbortSignal
} & AuthorizationPromptView

/** How one authorization attempt ended, as its own caller sees it. */
export type AuthorizationStatus = 'authorized' | 'cancelled'

/**
 * How one attempt ended, as an onlooker sees it. A failure reaches its caller
 * as a thrown error rather than an outcome, so `failed` exists only here — on
 * the event stream, where a watcher that did not start the attempt has no
 * other way to tell a refusal from a breakage.
 */
export type AuthorizationSettlement = AuthorizationStatus | 'failed'

/** The result of one `begin()` attempt. */
export interface AuthorizationOutcome {
  /** `authorized` once the record is committed and observed; `cancelled` when the human or caller withdrew. */
  status: AuthorizationStatus
  /**
   * The record the attempt committed — the flow's own key, or its account
   * slot's key when the request named one. Surfaces learn which account a
   * "add account" attempt landed on here rather than by enumeration order.
   */
  key: CredentialKey
}

/** A registered flow as a surface sees it: what it authorizes and whether it is busy. */
export interface AuthorizationEntry {
  /** The credential record this flow writes. */
  key: CredentialKey
  /** User-facing name of what is being authorized. */
  label: string
  /** The methods this flow offers, most preferred first. */
  methods: readonly AuthorizationMethod[]
  /** Whether an attempt for this key is running right now. */
  inFlight: boolean
}

/**
 * One account slot a multi-account flow has filled, as a surface sees it. The
 * record an attempt writes is `key`'s id suffixed `--<account>`; the flow's
 * own base record — one signed in before accounts existed — reports the empty
 * slot. `selected` names the slot the owning plugin's requests currently
 * resolve, never a secret.
 */
export interface AuthorizationAccountView {
  /** The stored record's address. */
  key: CredentialKey
  /**
   * The account slot — the suffix after `--` in the record id — or the empty
   * string for the flow's base record.
   */
  account: string
  /** Who the account belongs to, when the flow can read it off its own record. */
  label?: string
  /** Whether requests against the owning provider currently resolve to this account. */
  selected: boolean
}

/** One quota window a provider reports for an account: a 5-hour or weekly allowance. */
export interface AuthorizationQuotaWindow {
  /** Stable window identifier, e.g. `five-hour`, `seven-day`. */
  id: string
  /** User-facing window label. */
  label: string
  /** Share of the window consumed, 0–100. */
  usedPercent: number
  /** When the window resets, epoch milliseconds; absent when the provider does not say. */
  resetAt?: number
}

/** A provider's quota answer for one account, normalized across providers. */
export interface AuthorizationQuota {
  /** The plan or tier the account sits on, when the provider reports one. */
  plan?: string
  /** The provider's quota windows; empty means the provider reported none. */
  windows: readonly AuthorizationQuotaWindow[]
  /** A provider-supplied notice (quota endpoint unavailable but chat works), when one applies. */
  message?: string
  /** When this answer was read, epoch milliseconds. */
  fetchedAt: number
}

/** A notice one running attempt published, addressed to the surface that started it. */
export interface AuthorizationNoticeEvent {
  /** The credential record being authorized. */
  key: CredentialKey
  /** What the flow reported. */
  notice: AuthorizationNotice
}

/**
 * A question one running attempt is waiting on, addressed to the surface that
 * started it. The minted {@link AuthorizationPromptEvent.promptId} is the only
 * handle an answering surface gets: it is unguessable, so another connected
 * client that also sees this broadcast cannot answer in the owner's place
 * without knowing it.
 */
export interface AuthorizationPromptEvent {
  /** The credential record being authorized. */
  key: CredentialKey
  /** The attempt-scoped handle the answer must name. */
  promptId: string
  /** The question, without its withdrawal signal — signals do not cross the wire. */
  prompt: AuthorizationPromptView
}

/** A prompt that stopped needing an answer before one arrived. */
export interface AuthorizationPromptWithdrawnEvent {
  /** The credential record being authorized. */
  key: CredentialKey
  /** The prompt that closed. */
  promptId: string
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * One authorization attempt has finished and released its key. Fires for
     * every terminal outcome, failures included, so a surface watching a key it
     * did not start (a second browser tab) learns the attempt is over.
     * @mode emit
     * @param key - the credential record the finished attempt was authorizing.
     * @param settlement - how it ended, including the `failed` case its caller sees as a thrown error.
     */
    'authorization/settled'(key: CredentialKey, settlement: AuthorizationSettlement): void

    /**
     * Progress or an instruction from a running attempt, relayed to the
     * surface that started it. Broadcast rather than private: other surfaces
     * may watch, and only the prompt channel carries an answer handle.
     * @mode emit
     * @param event - the key and the reported notice.
     */
    'authorization/notice'(event: AuthorizationNoticeEvent): void

    /**
     * A running attempt is waiting on the human who started it. The
     * `promptId` it carries is the answer handle — generated per prompt and
     * never reused — so the surface that started the attempt answers exactly
     * the question it rendered.
     * @mode emit
     * @param event - the key, the answer handle, and the question.
     */
    'authorization/prompt'(event: AuthorizationPromptEvent): void

    /**
     * A surfaced prompt closed without an answer — the flow retired the
     * question itself (a browser callback won the race against the typed
     * code). The owning surface dismisses it rather than answering.
     * @mode emit
     * @param event - the key and the closed prompt's handle.
     */
    'authorization/prompt-withdrawn'(event: AuthorizationPromptWithdrawnEvent): void
  }
}
