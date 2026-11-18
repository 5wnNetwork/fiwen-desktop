# 用户凭据

[English](credentials.md) | 中文

[dsh-credentials](../../packages/credentials/credentials) 的凭据 seam 把机密挡在配置之外：settings 分节与 `cordis.yml` 条目携带的是*引用*（环境变量名），值归 [dsh-credentials-local](../../packages/credentials/credentials-local) 这类提供方所有，消费方每个操作解析一次引用——LLM（大语言模型）适配器每次模型请求解析一次，因此轮换后的凭据无需任何重启即可作用于紧随其后的下一次请求。一条 seam 级规则约束每个提供方：空的存储值在任何地方都视为不存在。

来源：[`packages/credentials/credentials/src/index.ts`](../../packages/credentials/credentials/src/index.ts)

DeepSeek 账号授权是其中一条记录；其登录、请求凭据和 Platform 会话见 [account.zh.md](account.zh.md)。

## 标识

引用以 POSIX 风格环境变量名命名一条凭据。brand 防止调用方将凭据引用与在包或进程之间传递的其他字符串混用；构造时校验 shell 标识符语法。

```ts type-equiv
/** Nominal reference to one credential: a POSIX-style environment-variable name. */
type CredentialRef = Branded<'CredentialRef'>
```

<a id="resolution"></a>
## 解析

`resolve(ref)` 返回值及提供该值的来源层（由提供方定义）；未配置期间返回 `undefined`。消费方在每个操作中重新解析，绝不跨操作缓存——这种按操作进行的读取正是热更新机制。

```ts type-equiv
/** One resolved credential value and the source layer that supplied it. */
interface ResolvedCredential {
  /** The non-empty secret value. */
  value: string
  /** Provider-defined source layer id (the local provider uses `env`, `file`, `project-env`, and `user-env`). */
  source: string
}
```

## 描述

`describe(ref)` 在绝不暴露值的前提下回应配置界面：引用当前是否可解析、来自哪一层、`set` 当前能否成功。可选的 `masked` 字段携带提供方生成的脱敏预览，不包含完整凭据。本地提供方将其管理的文件排在启动环境之前，因此保存值总会成为生效且可写的那一层；移除后会重新使用启动环境或 `.env` 后备值。

```ts type-equiv
/**
 * Configuration facts and an optional provider-masked preview for one
 * reference. The full credential is never part of this view.
 */
interface CredentialInfo {
  /** Whether resolving the reference would currently return a value. */
  configured: boolean
  /** Source layer currently supplying the value; absent while unconfigured. */
  source?: string
  /** Whether the active provider can write this reference. */
  writable: boolean
  /** Provider-generated masked preview of a stored value; never the full value. */
  masked?: string
}
```

## 已提交的变更

`credentials/reference-updated (ref)` 在提供方管理的来源发生已提交变更后发出——`set`、`unset` 或在存储中观察到的外部编辑。进程环境自身的变化不可观测，永不发出事件。消费方不需要该事件（它们按操作重新解析）；它服务于配置界面刷新「已配置」徽标。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxauthorization--authorizationservice"></a>

### `ctx.authorization` — `AuthorizationService`

`ctx.authorization`: a registry of credential-obtaining flows, one attempt at a time per key.

```ts cordis-catalog
/**
 * Offer a way to obtain one credential. One flow per key: two plugins
 * claiming the same key would each write a record in their own format, and
 * whichever ran last would leave the other reading a payload it cannot parse.
 *
 * @param flow - the key it writes, its label, its methods, and its runner.
 * @returns Disposer that withdraws this flow.
 * @throws {AuthorizationError} code `DUPLICATE_FLOW` when the key is already claimed.
 */
registerFlow(flow: AuthorizationFlow): () => void

/**
 * Every registered flow, for a surface listing what can be authorized.
 * @returns one entry per flow, in registration order.
 */
list(): readonly AuthorizationEntry[]

/**
 * One registered flow.
 * @param key - the credential record to ask about.
 * @returns the entry, or undefined when no flow claims that key.
 */
describe(key: CredentialKey): AuthorizationEntry | undefined

/**
 * Every account slot a flow has stored, for a surface offering account
 * management. The base record — one authorized before accounts existed —
 * reports the empty slot; the `--selected` pointer itself never appears.
 * `selected` reflects the same resolution a request would use: the pointer's
 * account when its record is stored, else the base record's fallback.
 * @param key - the flow's record key.
 * @returns one view per stored account record, base record first.
 * @throws {AuthorizationError} code `NO_FLOW` when nothing claims the key.
 */
async listAccounts(key: CredentialKey): Promise<readonly AuthorizationAccountView[]>

/**
 * Choose which stored account a flow's requests resolve to. The pointer is
 * a record inside the flow's own key space, so resolution stays in the
 * owning plugin's store and the write goes through the same event stream.
 * @param key - the flow's record key.
 * @param account - the slot to select; `''` selects the base record.
 * @throws {AuthorizationError} code `NO_FLOW` when nothing claims the key,
 *   `INVALID_ACCOUNT` when the slot is not a credential-key segment, or
 *   `UNKNOWN_ACCOUNT` when no record is stored under it.
 */
async selectAccount(key: CredentialKey, account: string): Promise<void>

/**
 * Ask a flow for one stored account's quota. The probed account defaults to
 * the selected one — the same resolution a request would use — and a flow
 * that refreshes its token to answer writes the rotated credential back to
 * that same record through the supplied persist callback.
 * @param key - the flow's record key.
 * @param account - the slot to probe; `''` is the base record, absent resolves the selection.
 * @param signal - aborts the probe.
 * @returns the normalized quota, or `undefined` when the flow offers no
 *   probe or no grant record is stored under the resolved slot.
 * @throws {AuthorizationError} code `NO_FLOW` when nothing claims the key,
 *   or `INVALID_ACCOUNT` when the named slot is not a credential-key segment.
 */
async quota(key: CredentialKey, account?: string, signal?: AbortSignal): Promise<AuthorizationQuota | undefined>

/**
 * Withdraw the attempt running for a key, if any. Separate from the
 * request's own signal because a request/response transport answers a Cancel
 * button on a second call, with no handle on the first one's signal.
 * @param key - the credential record whose attempt should stop.
 */
cancel(key: CredentialKey): void

/**
 * Run one attempt to authorize a key, and report how it ended.
 *
 * One attempt per key at a time. A second caller is refused rather than
 * joined: the two would be prompting different humans through the same flow,
 * and the second would answer questions the first was asked.
 *
 * @param request - the key, the method, the surface, and the cancel signal.
 * @returns `authorized` once the flow's record is committed during this
 *   attempt and observed, or `cancelled` when the human declined or the
 *   caller withdrew.
 * @throws {AuthorizationError} code `NO_FLOW` when nothing claims the key,
 *   `UNKNOWN_METHOD` when the named method is not one the flow offers,
 *   `ALREADY_IN_FLIGHT` when an attempt is already running for the key, or
 *   `NOT_COMMITTED` when the flow resolved without committing a record
 *   during the attempt.
 */
async begin(request: AuthorizationRequest): Promise<AuthorizationOutcome>
```

Source: [`packages/credentials/authorization/src/index.ts`](../../packages/credentials/authorization/src/index.ts)

<a id="ctxauthorizationcontroller--authorizationcontroller"></a>

### `ctx.authorizationController` — `AuthorizationController`

Host service backing the generated `ctx.remote.authorization` namespace. It turns the seam's request-scoped AuthorizationInteraction into the wire conversation: each `begin` relays the flow's notices and prompts as `authorization/notice` / `authorization/prompt` events, and `answer` / `decline` resolve the pending prompt the surface names by its minted id. Single-flight per key stays with the seam — a second `begin` while one runs fails as `authorization/rejected`, and `cancel` is how a surface whose own request is still open withdraws it.

```ts cordis-catalog
/**
 * Every registered flow with its stored-credential state, for a surface
 * listing what can be authorized.
 * @returns one view per flow, in registration order.
 * @throws RemoteError when no authorization or credential service is mounted.
 */
@Remote async list(): Promise<AuthorizationEntryView[]>

/**
 * One record's flow and stored-credential state. The `configured` half
 * answers independently of `entry` on purpose: a stored grant whose flow's
 * plugin is gone is still a credential the surface can let the user sign out.
 * @param key - the credential record to describe; malformed keys reject as `gateway/bad-request`.
 * @returns the key, its flow view when registered, and its stored state.
 * @throws RemoteError when the request is invalid or a required service is absent.
 */
@Remote async describe(key: string): Promise<AuthorizationDescribeView>

/**
 * Every account a flow has stored, for an account-management surface.
 * @param key - the flow's record key.
 * @returns one view per stored account record, base record first.
 * @throws RemoteError `authorization/rejected` when no flow claims the key.
 */
@Remote async listAccounts(key: string): Promise<readonly AuthorizationAccountView[]>

/**
 * Choose which stored account a flow's requests resolve to.
 * @param key - the flow's record key.
 * @param account - the account slot to select; `''` selects the base record.
 * @throws RemoteError `authorization/rejected` when no flow claims the key,
 *   the slot is malformed, or no record is stored under it.
 */
@Remote async selectAccount(key: string, account: string): Promise<void>

/**
 * Ask a flow for one stored account's provider quota.
 * @param key - the flow's record key.
 * @param account - the account slot to probe; `''` is the base record, absent resolves the selection.
 * @param signal - caller lifetime; aborting abandons the probe.
 * @returns the normalized quota, or `undefined` when the flow offers none or nothing is stored.
 * @throws RemoteError `authorization/rejected` when no flow claims the key or the slot is malformed.
 */
@Remote async quota(key: string, account: string | undefined, signal: AbortSignal): Promise<AuthorizationQuota | undefined>

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
@Remote async begin(key: string, method: string | undefined, account: string | undefined, signal: AbortSignal): Promise<AuthorizationOutcome>

/**
 * Deliver the human's answer to a waiting prompt.
 * @param promptId - the handle from `authorization/prompt`.
 * @param value - the typed text, or the chosen option's id.
 * @returns whether a prompt was still waiting for the id; `false` means it
 *   settled or was withdrawn first, which is an outcome, not a failure.
 */
@Remote answer(promptId: string, value: string): boolean

/**
 * Tell a waiting prompt the human declined it.
 * @param promptId - the handle from `authorization/prompt`.
 * @returns whether a prompt was still waiting for the id.
 */
@Remote decline(promptId: string): boolean

/**
 * Withdraw the attempt running for a key. The request/response transport
 * answers a Cancel control on a second call, which has no handle on the
 * first call's signal.
 * @param key - the credential record whose attempt should stop.
 * @throws RemoteError when the request is invalid or no authorization service is mounted.
 */
@Remote cancel(key: string): void

/**
 * Remove one stored credential record — the surface's "sign out". Removing
 * an absent record is a no-op.
 * @param key - the credential record to remove.
 * @throws RemoteError when the request is invalid, no credential service is mounted, or the store refuses.
 */
@Remote async signOut(key: string): Promise<void>
```

Source: [`packages/api/settings-controller/src/authorization.ts`](../../packages/api/settings-controller/src/authorization.ts)

<a id="ctxcredentials--credentialprovider-abstract-seam"></a>

### `ctx.credentials` — `CredentialProvider` (abstract seam)

Abstract credential service over two key spaces that answer two questions.

A CredentialRef answers "what is behind this environment-variable name": the provider-managed store first, then ambient fallbacks such as the process environment and `.env` files. One seam-wide rule binds that half: an empty stored value is absent everywhere — `resolve` skips it, `describe` reports it unconfigured — so a blank never masquerades as a configured secret.

A CredentialKey answers "what credential does this plugin hold for this id". Nothing can layer here — an authorization grant has no environment to be read from — so presence of the record is the whole fact, and modifyRecord is the only write path because a correct write depends on the current value (a token refresh is read-decide-replace under one lock).

```ts cordis-catalog
/**
 * Resolve one reference to its current value. Resolution is per call:
 * consumers re-resolve at each operation and must not cache across
 * operations — that per-operation read is what makes a changed credential
 * reach the next operation without a restart.
 * @param ref - the reference to resolve.
 * @returns the value and its source, or `undefined` while unconfigured.
 */
abstract resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined>

/**
 * Describe one reference for configuration surfaces without exposing the
 * full value.
 * @param ref - the reference to describe.
 * @returns configured state, supplying source, writability, and optional masked preview.
 */
abstract describe(ref: CredentialRef): Promise<CredentialInfo>

/**
 * Durably store one value in the provider-managed writable source. The stored
 * value takes precedence over ambient fallbacks, and empty values are
 * rejected (use {@link unset}).
 * @param ref - the reference to store.
 * @param value - the non-empty secret value.
 */
abstract set(ref: CredentialRef, value: string): Promise<void>

/**
 * Remove one reference from the provider-managed writable source; removing
 * an absent reference is a no-op. Ambient fallback layers may become
 * effective again after removal.
 * @param ref - the reference to remove.
 */
abstract unset(ref: CredentialRef): Promise<void>

/**
 * Read one stored record. The value is returned as its owner wrote it; a
 * {@link GrantRecord} payload is not interpreted on the way out.
 * @param key - the record to read.
 * @returns the record, or `undefined` while none is stored.
 */
abstract readRecord(key: CredentialKey): Promise<CredentialRecord | undefined>

/**
 * Describe one record for configuration surfaces without exposing its value.
 * @param key - the record to describe.
 * @returns presence, discriminant, and writability.
 */
abstract describeRecord(key: CredentialKey): Promise<CredentialRecordInfo>

/**
 * Enumerate every stored record's address and tag. Unlike the reference
 * half, which has no enumeration because configuration surfaces learn which
 * references exist from settings schemas, records have no such discovery
 * path: a surface that cannot list them cannot show what a user is
 * authorized for, nor find an orphan left by an uninstalled plugin.
 * @returns every stored record, values excluded.
 */
abstract listRecords(): Promise<readonly CredentialRecordEntry[]>

/**
 * Serialized read-modify-write over one record — the only write path.
 * `mutate` sees the record as it stands at the moment the write is
 * exclusive, and returning `undefined` leaves the entry untouched. Exclusion
 * holds across processes where the backing store supports it, which is what
 * makes a token refresh safe: two processes rotating one refresh token
 * concurrently would otherwise lose whichever wrote first.
 * @param key - the record to modify.
 * @param mutate - receives the current record and returns its replacement, or `undefined` to leave it.
 * @returns the record after the write, or the current one when `mutate` declined.
 */
abstract modifyRecord( key: CredentialKey, mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>, ): Promise<CredentialRecord | undefined>

/**
 * Remove one record; removing an absent record is a no-op.
 * @param key - the record to remove.
 */
abstract deleteRecord(key: CredentialKey): Promise<void>
```

Source: [`packages/credentials/credentials/src/index.ts`](../../packages/credentials/credentials/src/index.ts)

<a id="ctxcredentialscontroller--credentialscontroller"></a>

### `ctx.credentialsController` — `CredentialsController`

Host service backing the generated `ctx.remote.credentials` namespace. It carries every wire obligation the credential seam itself does not: the batch fan-out bound, the field-by-field view projection, the reference-grammar guard, and the refusal mapping. Full secret values cross in one direction only — no method here returns one.

```ts cordis-catalog
/**
 * Describe several references for one configuration surface. Batched because
 * a settings page describes every reference its rows name at once, and one
 * round trip keeps those rows from settling separately.
 * @param refs - reference names, at most {@link MAX_DESCRIBE_REFS}; a name outside the grammar
 *   rejects the whole call as `gateway/bad-request`.
 * @returns one view per requested name, keyed by that name.
 * @throws RemoteError when the request is invalid or no credential provider is mounted.
 */
@Remote async describe(refs: string[]): Promise<Record<string, CredentialInfo>>

/**
 * Store one value from a configuration surface. The value crosses the wire in
 * this direction only: no read path returns it.
 * @param ref - reference name to store under.
 * @param value - the non-empty secret value.
 * @throws RemoteError when the request is invalid, no provider is mounted, or the provider refuses the write.
 */
@Remote async set(ref: string, value: string): Promise<void>

/**
 * Remove one reference from a configuration surface.
 * @param ref - reference name to remove.
 * @throws RemoteError when the request is invalid, no provider is mounted, or the provider refuses the write.
 */
@Remote async unset(ref: string): Promise<void>
```

Source: [`packages/api/settings-controller/src/credentials.ts`](../../packages/api/settings-controller/src/credentials.ts)

<a id="authorization-events"></a>

### `authorization/*` events

<a id="authorizationnotice--emit"></a>

#### `authorization/notice` — emit

Progress or an instruction from a running attempt, relayed to the surface that started it. Broadcast rather than private: other surfaces may watch, and only the prompt channel carries an answer handle.

```ts cordis-catalog
/**
 * Progress or an instruction from a running attempt, relayed to the
 * surface that started it. Broadcast rather than private: other surfaces
 * may watch, and only the prompt channel carries an answer handle.
 * @mode emit
 * @param event - the key and the reported notice.
 */
'authorization/notice'(event: AuthorizationNoticeEvent): void
```

Source: [`packages/credentials/authorization/src/types.ts`](../../packages/credentials/authorization/src/types.ts)

<a id="authorizationprompt--emit"></a>

#### `authorization/prompt` — emit

A running attempt is waiting on the human who started it. The `promptId` it carries is the answer handle — generated per prompt and never reused — so the surface that started the attempt answers exactly the question it rendered.

```ts cordis-catalog
/**
 * A running attempt is waiting on the human who started it. The
 * `promptId` it carries is the answer handle — generated per prompt and
 * never reused — so the surface that started the attempt answers exactly
 * the question it rendered.
 * @mode emit
 * @param event - the key, the answer handle, and the question.
 */
'authorization/prompt'(event: AuthorizationPromptEvent): void
```

Source: [`packages/credentials/authorization/src/types.ts`](../../packages/credentials/authorization/src/types.ts)

<a id="authorizationprompt-withdrawn--emit"></a>

#### `authorization/prompt-withdrawn` — emit

A surfaced prompt closed without an answer — the flow retired the question itself (a browser callback won the race against the typed code). The owning surface dismisses it rather than answering.

```ts cordis-catalog
/**
 * A surfaced prompt closed without an answer — the flow retired the
 * question itself (a browser callback won the race against the typed
 * code). The owning surface dismisses it rather than answering.
 * @mode emit
 * @param event - the key and the closed prompt's handle.
 */
'authorization/prompt-withdrawn'(event: AuthorizationPromptWithdrawnEvent): void
```

Source: [`packages/credentials/authorization/src/types.ts`](../../packages/credentials/authorization/src/types.ts)

<a id="authorizationsettled--emit"></a>

#### `authorization/settled` — emit

One authorization attempt has finished and released its key. Fires for every terminal outcome, failures included, so a surface watching a key it did not start (a second browser tab) learns the attempt is over.

```ts cordis-catalog
/**
 * One authorization attempt has finished and released its key. Fires for
 * every terminal outcome, failures included, so a surface watching a key it
 * did not start (a second browser tab) learns the attempt is over.
 * @mode emit
 * @param key - the credential record the finished attempt was authorizing.
 * @param settlement - how it ended, including the `failed` case its caller sees as a thrown error.
 */
'authorization/settled'(key: CredentialKey, settlement: AuthorizationSettlement): void
```

Source: [`packages/credentials/authorization/src/types.ts`](../../packages/credentials/authorization/src/types.ts)

<a id="credentials-events"></a>

### `credentials/*` events

<a id="credentialsrecord-updated--emit"></a>

#### `credentials/record-updated` — emit

Committed change to a stored credential record: a `modifyRecord` that wrote, a `deleteRecord` that removed, or an external edit observed in storage. Separate from `credentials/reference-updated` because the two key grammars are disjoint — a listener that received both on one event could not tell which space a subject belongs to. Listener failures are contained on the same terms as `credentials/reference-updated`.

```ts cordis-catalog
/**
 * Committed change to a stored credential record: a `modifyRecord` that
 * wrote, a `deleteRecord` that removed, or an external edit observed in
 * storage. Separate from `credentials/reference-updated` because the two key
 * grammars are disjoint — a listener that received both on one event could
 * not tell which space a subject belongs to. Listener failures are
 * contained on the same terms as `credentials/reference-updated`.
 * @param key - the record whose stored value changed.
 * @mode emit
 */
'credentials/record-updated'(key: CredentialKey): void
```

Source: [`packages/credentials/credentials/src/types.ts`](../../packages/credentials/credentials/src/types.ts)

<a id="credentialsreference-updated--emit"></a>

#### `credentials/reference-updated` — emit

Committed change to a provider-managed credential source: a `set`, an `unset`, or an external edit observed in storage. Ambient process-environment changes are not observable and never emit. Listener failures are contained and logged — a sync throw and an async rejection alike — without changing the committed operation's outcome.

```ts cordis-catalog
/**
 * Committed change to a provider-managed credential source: a `set`, an
 * `unset`, or an external edit observed in storage. Ambient
 * process-environment changes are not observable and never emit. Listener
 * failures are contained and logged — a sync throw and an async rejection
 * alike — without changing the committed operation's outcome.
 * @param ref - the reference whose stored value changed.
 * @mode emit
 */
'credentials/reference-updated'(ref: CredentialRef): void
```

Source: [`packages/credentials/credentials/src/types.ts`](../../packages/credentials/credentials/src/types.ts)
<!-- END GENERATED cordis-surface -->
