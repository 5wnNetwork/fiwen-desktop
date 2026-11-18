/**
 * Service Definition for the authorization capability seam (`ctx.authorization`):
 * obtaining a credential nobody can supply from configuration alone, because
 * getting it requires a conversation with the human — open this page, paste
 * that code, pick an account.
 *
 * The seam owns the conversation and the lifecycle; it never owns the protocol.
 * A plugin that knows how to obtain its own credential registers a flow keyed
 * by the `CredentialKey` that flow writes, and the flow talks to whatever
 * surface started it through one neutral vocabulary of notices and prompts. So
 * a second authorization protocol arrives as another flow rather than as
 * another seam, and a surface that renders one flow renders all of them.
 *
 * ```ts
 * const dispose = ctx.authorization.registerFlow({
 *   key: credentialKey('llm-pi-ai', 'openai-codex'),
 *   label: 'ChatGPT (Codex)',
 *   methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }],
 *   async run(session) {
 *     session.notify({ message: 'Continue in your browser', url })
 *     await commitThroughCredentials(await exchange(session.signal))
 *   },
 * })
 * ```
 *
 * @module @deepseek-ai/dsh-authorization
 */
import { Service } from '@deepseek-ai/cordis';
import { credentialKey, credentialKeyId, credentialKeyScope, isCredentialKeySegment } from '@deepseek-ai/dsh-credentials';
import { HarnessError } from '@deepseek-ai/dsh-error';
/**
 * The separator between a record id and its account slot. A flow that admits
 * several accounts writes the base record at its own key and each account at
 * `<id>--<slot>`; the slot is a credential-key segment on its own.
 */
export const ACCOUNT_SEPARATOR = '--';
/** The reserved slot name whose record carries the selected account: `{ account: slot }`. */
export const SELECTION_SLOT = 'selected';
/**
 * The record id a flow's account slot writes under.
 * @param id - the flow key's id segment.
 * @param account - the account slot.
 * @returns `<id>--<account>`.
 */
export function accountRecordId(id, account) {
    return `${id}${ACCOUNT_SEPARATOR}${account}`;
}
/**
 * The account slot of a record id a flow wrote, when it names one.
 * @param id - a record id under a flow's scope.
 * @returns the slot after the first `--`, or `undefined` for the base record.
 */
export function accountSlotOf(id) {
    const at = id.indexOf(ACCOUNT_SEPARATOR);
    return at === -1 ? undefined : id.slice(at + ACCOUNT_SEPARATOR.length);
}
/**
 * The flow's own key for a record key it or one of its accounts wrote.
 * @param key - a record key, possibly an account key.
 * @returns the flow's registration key.
 */
export function flowKeyOf(key) {
    const id = credentialKeyId(key);
    const at = id.indexOf(ACCOUNT_SEPARATOR);
    if (at === -1)
        return key;
    return credentialKey(credentialKeyScope(key), id.slice(0, at));
}
/**
 * The record key a flow's selected-account pointer writes under.
 * @param key - the flow's record key.
 * @returns `<key id>--selected` under the same scope.
 */
export function selectionKeyFor(key) {
    return credentialKey(credentialKeyScope(key), accountRecordId(credentialKeyId(key), SELECTION_SLOT));
}
/**
 * The account slot a selection pointer names, read off its stored record. The
 * pointer is a grant record carrying `{ account }` — metadata, never a
 * credential — and anything else reads as "no selection".
 * @param record - the record stored at {@link selectionKeyFor}'s key.
 * @returns the selected slot — `''` selects the base record — or `undefined`.
 */
export function accountSelectionOf(record) {
    if (record?.kind !== 'grant')
        return undefined;
    if (typeof record.payload !== 'object' || record.payload === null)
        return undefined;
    const account = record.payload.account;
    return typeof account === 'string' ? account : undefined;
}
/**
 * Every stored account slot for `key` — `''` for the base record, each `--`
 * suffix otherwise. The selection pointer shares the prefix but is not an
 * account, and a record id that cannot carry a slot name is not one either.
 * @param credentials - the record plane to enumerate.
 * @param key - a flow's record key.
 * @returns the slots currently stored, in enumeration order.
 */
async function storedAccountSlots(credentials, key) {
    const scope = credentialKeyScope(key);
    const id = credentialKeyId(key);
    const prefix = `${id}${ACCOUNT_SEPARATOR}`;
    const slots = [];
    for (const entry of await credentials.listRecords()) {
        if (credentialKeyScope(entry.key) !== scope)
            continue;
        const entryId = credentialKeyId(entry.key);
        if (entryId === id)
            slots.push('');
        else if (entryId.startsWith(prefix)) {
            const slot = entryId.slice(prefix.length);
            if (slot !== SELECTION_SLOT && isCredentialKeySegment(slot))
                slots.push(slot);
        }
    }
    return slots;
}
/**
 * The account slot requests for `key` resolve to: the pointer's account when
 * its record is still stored, else the base record's when one is stored,
 * else the first remaining account — a deleted selection never strands the
 * provider while another account stands.
 * @param credentials - the record plane to read.
 * @param key - a flow's record key.
 * @param stored - the slots known to be stored, when the caller already enumerated them.
 * @returns the resolving slot, or `undefined` when nothing is stored.
 */
async function selectedAccountSlot(credentials, key, stored) {
    const pointer = accountSelectionOf(await credentials.readRecord(selectionKeyFor(key)));
    const slots = stored !== undefined ? stored : await storedAccountSlots(credentials, key);
    const matched = pointer !== undefined && slots.includes(pointer);
    if (matched)
        return pointer;
    if (slots.includes(''))
        return '';
    return slots.find(slot => slot !== '');
}
/**
 * The record key that serves requests for `key` under account selection. A
 * key that already names an account record — slot suffix included —
 * addresses itself; a base key resolves through the pointer with the same
 * fallback {@link AuthorizationService.listAccounts} reports, so the record
 * a surface shows as selected is the record a request reads. Nothing stored
 * still answers `key` itself, so a first write creates the base record.
 * @param credentials - the record plane to resolve against.
 * @param key - the record key a request asks for.
 * @returns the record key to read or write.
 */
export async function resolveRecordKey(credentials, key) {
    const id = credentialKeyId(key);
    if (accountSlotOf(id) !== undefined)
        return key;
    const slot = await selectedAccountSlot(credentials, key);
    if (slot === undefined || slot === '')
        return key;
    return credentialKey(credentialKeyScope(key), accountRecordId(id, slot));
}
/** Stable error taxonomy for authorization failures. */
export class AuthorizationError extends HarnessError {
    constructor(message, code, options) {
        super(message, code, options);
        this.name = 'AuthorizationError';
    }
}
/**
 * The rejection an {@link AuthorizationInteraction.prompt} uses to say the
 * human declined — dismissed the question, chose not to answer — rather than
 * that the surface broke. An attempt whose flow fails after a prompt was
 * declined settles as `cancelled`, the same outcome as a withdrawn signal,
 * because the human saying no is a refusal, not a breakage. Only a human's
 * "no" may reject with this class: a prompt withdrawn by its own `signal` (a
 * flow retiring the losing question of a race) must reject with something
 * else, or a later genuine failure would be misread as a decline.
 */
export class AuthorizationDeclinedError extends AuthorizationError {
    constructor(message = 'the authorization prompt was declined') {
        super(message, 'DECLINED');
        this.name = 'AuthorizationDeclinedError';
    }
}
/**
 * `ctx.authorization`: a registry of credential-obtaining flows, one attempt at
 * a time per key.
 */
export class AuthorizationService extends Service {
    /** The commit this seam confirms is a credential-record write, so the store is required, not optional. */
    static inject = ['credentials'];
    flows = new Map();
    running = new Map();
    constructor(ctx) {
        super(ctx, 'authorization');
    }
    /**
     * Offer a way to obtain one credential. One flow per key: two plugins
     * claiming the same key would each write a record in their own format, and
     * whichever ran last would leave the other reading a payload it cannot parse.
     *
     * @param flow - the key it writes, its label, its methods, and its runner.
     * @returns Disposer that withdraws this flow.
     * @throws {AuthorizationError} code `DUPLICATE_FLOW` when the key is already claimed.
     */
    registerFlow(flow) {
        const dispose = this.ctx.effect(function* () {
            if (this.flows.has(flow.key)) {
                throw new AuthorizationError(`an authorization flow for "${flow.key}" is already registered`, 'DUPLICATE_FLOW');
            }
            this.flows.set(flow.key, flow);
            yield () => {
                this.flows.delete(flow.key);
                // A flow leaving mid-attempt takes its attempt with it: the runner
                // belongs to a plugin that is going away, so letting it keep prompting
                // would outlive the fiber that can answer for it.
                this.cancel(flow.key);
            };
        }.bind(this), 'authorization.registerFlow()');
        return () => void dispose();
    }
    /**
     * Every registered flow, for a surface listing what can be authorized.
     * @returns one entry per flow, in registration order.
     */
    list() {
        return [...this.flows.values()].map(flow => this.entry(flow));
    }
    /**
     * One registered flow.
     * @param key - the credential record to ask about.
     * @returns the entry, or undefined when no flow claims that key.
     */
    describe(key) {
        const flow = this.flows.get(key);
        return flow === undefined ? undefined : this.entry(flow);
    }
    /** The public view of one registered flow. */
    entry(flow) {
        return {
            key: flow.key,
            label: flow.label,
            methods: flow.methods,
            inFlight: this.running.has(flow.key),
        };
    }
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
    async listAccounts(key) {
        const flow = this.flows.get(key);
        if (flow === undefined) {
            throw new AuthorizationError(`no authorization flow is registered for "${key}"`, 'NO_FLOW');
        }
        const scope = credentialKeyScope(key);
        const id = credentialKeyId(key);
        const prefix = `${id}${ACCOUNT_SEPARATOR}`;
        const entries = [];
        for (const entry of await this.ctx.credentials.listRecords()) {
            if (credentialKeyScope(entry.key) !== scope)
                continue;
            const entryId = credentialKeyId(entry.key);
            if (entryId === id) {
                entries.push({ key: entry.key, account: '' });
            }
            else if (entryId.startsWith(prefix)) {
                const account = entryId.slice(prefix.length);
                // The pointer record shares the prefix but is not an account.
                if (account !== SELECTION_SLOT && isCredentialKeySegment(account)) {
                    entries.push({ key: entry.key, account });
                }
            }
        }
        const selected = await this.selectedAccount(key, entries.map(entry => entry.account));
        const views = [];
        for (const entry of entries) {
            const record = await this.ctx.credentials.readRecord(entry.key);
            if (record === undefined)
                continue;
            const described = flow.describeRecord?.(record) ?? {};
            views.push({
                key: entry.key,
                account: entry.account,
                ...described.label === undefined ? {} : { label: described.label },
                ...described.expiresAt === undefined ? {} : { expiresAt: described.expiresAt },
                selected: entry.account === selected,
            });
        }
        return views;
    }
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
    async selectAccount(key, account) {
        const flow = this.flows.get(key);
        if (flow === undefined) {
            throw new AuthorizationError(`no authorization flow is registered for "${key}"`, 'NO_FLOW');
        }
        if (account !== '' && (!isCredentialKeySegment(account) || account === SELECTION_SLOT)) {
            throw new AuthorizationError(`account "${account}" is not a credential-key segment`, 'INVALID_ACCOUNT');
        }
        const target = account === '' ? key : this.commitKey(flow, account);
        const stored = await this.ctx.credentials.describeRecord(target);
        if (!stored.configured) {
            throw new AuthorizationError(`no account "${account}" is stored for "${key}"`, 'UNKNOWN_ACCOUNT');
        }
        await this.writeSelection(key, account);
    }
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
    async quota(key, account, signal) {
        const flow = this.flows.get(key);
        if (flow === undefined) {
            throw new AuthorizationError(`no authorization flow is registered for "${key}"`, 'NO_FLOW');
        }
        if (flow.quota === undefined)
            return undefined;
        if (account !== undefined && account !== ''
            && (!isCredentialKeySegment(account) || account === SELECTION_SLOT)) {
            throw new AuthorizationError(`account "${account}" is not a credential-key segment`, 'INVALID_ACCOUNT');
        }
        const resolved = account ?? await this.selectedAccount(key);
        if (resolved === undefined)
            return undefined;
        const target = resolved === '' ? key : this.commitKey(flow, resolved);
        const record = await this.ctx.credentials.readRecord(target);
        if (record?.kind !== 'grant')
            return undefined;
        const { payload } = record;
        return flow.quota({
            payload,
            signal: signal ?? new AbortController().signal,
            // Persist only over an existing grant: an account deleted while its
            // probe was in flight must not be resurrected by the refresh landing.
            persist: async (replacement) => {
                await this.ctx.credentials.modifyRecord(target, current => Promise.resolve(current?.kind === 'grant' ? { kind: 'grant', payload: replacement } : current));
            },
        });
    }
    /**
     * The account slot a flow's requests currently resolve to: the pointer's
     * account when its record is still stored, else the base record's when one
     * is stored, else the first remaining account — the same fallback the
     * credential-store redirect applies, so a deleted selection never strands
     * the provider while another account stands.
     * @param key - the flow's record key.
     * @param stored - the account slots known to be stored, when the caller already enumerated them.
     * @returns the resolving slot, or `undefined` when nothing is stored.
     */
    async selectedAccount(key, stored) {
        return selectedAccountSlot(this.ctx.credentials, key, stored);
    }
    /**
     * Write the selected-account pointer for `flowKey`. This service is the
     * pointer's only writer: it is the code whose write fires the record update
     * the surfaces refresh on, and a pointer written anywhere else would move
     * the credential-store redirect without that signal.
     * @param flowKey - the flow's record key.
     * @param account - the account slot to select; `''` selects the base record.
     */
    async writeSelection(flowKey, account) {
        await this.ctx.credentials.modifyRecord(selectionKeyFor(flowKey), () => Promise.resolve({
            kind: 'grant',
            payload: { account },
        }));
    }
    /**
     * Withdraw the attempt running for a key, if any. Separate from the
     * request's own signal because a request/response transport answers a Cancel
     * button on a second call, with no handle on the first one's signal.
     * @param key - the credential record whose attempt should stop.
     */
    cancel(key) {
        const running = this.running.get(key);
        if (running !== undefined && !running.committing)
            running.controller.abort();
    }
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
    async begin(request) {
        const { key } = request;
        const flow = this.flows.get(key);
        if (flow === undefined) {
            throw new AuthorizationError(`no authorization flow is registered for "${key}"`, 'NO_FLOW');
        }
        // The slot joins the flow's record id as one more key segment, so it must
        // be a segment itself — and never the reserved selection pointer's name.
        if (request.account !== undefined
            && (!isCredentialKeySegment(request.account) || request.account === SELECTION_SLOT)) {
            throw new AuthorizationError(`account "${request.account}" is not a credential-key segment`, 'INVALID_ACCOUNT');
        }
        const method = request.method ?? flow.methods[0].id;
        if (!flow.methods.some(candidate => candidate.id === method)) {
            throw new AuthorizationError(`authorization flow for "${key}" offers no method "${method}"`, 'UNKNOWN_METHOD');
        }
        if (this.running.has(key)) {
            throw new AuthorizationError(`an authorization attempt for "${key}" is already running`, 'ALREADY_IN_FLIGHT');
        }
        // Withdrawn before it began: never claim the slot and never run the flow.
        // Handing an aborted signal to `run()` would rely on every flow checking it
        // before its first await, and one that does not would hang holding the key.
        // Validation still runs first, so a caller naming a key or method that does
        // not exist hears about it whether or not it also gave up.
        if (request.signal?.aborted === true) {
            return { status: 'cancelled', key: this.commitKey(flow, request.account) };
        }
        const controller = new AbortController();
        const withdraw = () => {
            const running = this.running.get(key);
            if (running !== undefined && !running.committing)
                controller.abort(request.signal?.reason);
        };
        request.signal?.addEventListener('abort', withdraw, { once: true });
        this.running.set(key, { controller, committing: false });
        let settlement = 'failed';
        try {
            const outcome = await this.attempt(flow, method, controller.signal, request.interaction, request.account);
            settlement = outcome.status;
            return outcome;
        }
        finally {
            request.signal?.removeEventListener('abort', withdraw);
            this.running.delete(key);
            // After the slot is released, so a listener that reacts by starting the
            // next attempt is not refused by the one that just finished.
            this.settle(key, settlement);
        }
    }
    /**
     * The record one attempt must commit: the flow's own key, or its account
     * slot's key when the request named one.
     * @param flow - the running flow.
     * @param account - the request's account slot.
     * @returns the record the seam's commit check watches.
     */
    commitKey(flow, account) {
        if (account === undefined)
            return flow.key;
        return credentialKey(credentialKeyScope(flow.key), accountRecordId(credentialKeyId(flow.key), account));
    }
    /* jscpd:ignore-start -- deliberate symmetry with the credentials seam's
       commit fan-out (`CredentialProvider`): the contained-dispatch shape is the
       reviewed listener-lifecycle contract, and extracting it would couple the
       two seams' event semantics. */
    /**
     * Fan `authorization/settled` out with contained listener failures: every
     * listener runs, and a sync throw or async rejection is logged without
     * changing the finished attempt's own outcome. The attempt is already
     * over and its key released when this fires, so a broken watcher (that
     * second browser tab) can never turn the caller's settled result into a
     * failure of its own.
     */
    settle(key, settlement) {
        const args = ['authorization/settled', key, settlement];
        for (const listener of this.ctx.events.dispatch('emit', args)) {
            try {
                const returned = listener(key, settlement);
                if (returned != null && typeof returned.then === 'function') {
                    void Promise.resolve(returned).then(undefined, (error) => {
                        this.warnSettledListenerFailure(key, error);
                    });
                }
            }
            catch (error) {
                this.warnSettledListenerFailure(key, error);
            }
        }
    }
    /* jscpd:ignore-end */
    /** Contained-listener diagnostic shared by the sync and async failure paths. */
    warnSettledListenerFailure(key, error) {
        this.ctx.logger.warn('authorization: an authorization/settled listener for "%s" failed', key);
        this.ctx.logger.warn(error);
    }
    /** Run the flow, then hold it to its half of the commit contract. */
    async attempt(flow, method, signal, interaction, account) {
        // The commit may land on the flow's account slot rather than its own key:
        // the watcher's subject is the record the attempt must produce, which is
        // the account record, while the attempt slot stays keyed on the flow.
        const commit = this.commitKey(flow, account);
        // Withdrawal settles the attempt whether or not the flow reacts to it. A
        // flow is supposed to stop when its signal fires, but one that does not
        // would otherwise hold the key for the life of the process, and a wedged
        // key is indistinguishable from a busy one from the outside. The orphaned
        // run is left to finish on its own; nothing waits on it, and a record it
        // still manages to commit is a record the human did authorize.
        const withdrawn = new Promise((resolve) => {
            // `begin()` returns before claiming the key when its caller has already
            // withdrawn, so this signal cannot already be aborted here.
            signal.addEventListener('abort', () => { resolve('withdrawn'); }, { once: true });
        });
        // What the seam itself witnessed during the run, held as properties
        // because closure writes do not narrow locals across awaits: the prompt
        // wrapper sees a decline first-hand (a flow that rewraps the rejection on
        // its way out cannot hide it), and confirming the commit means confirming
        // it happened *now* — on a re-auth the record already exists, so presence
        // alone would let a flow that wrote nothing report the stale credential
        // as freshly authorized.
        const observed = { declined: false, committed: false };
        const unwatch = this.ctx.on('credentials/record-updated', (key) => {
            if (key === commit)
                observed.committed = true;
        });
        try {
            const running = flow.run({
                method,
                ...account === undefined ? {} : { account },
                signal,
                commit: async (record) => {
                    signal.throwIfAborted();
                    const attempt = this.running.get(flow.key);
                    if (attempt === undefined || attempt.controller.signal !== signal) {
                        throw new AuthorizationError('authorization attempt is no longer active', 'CANCELLED');
                    }
                    attempt.committing = true;
                    await this.ctx.credentials.modifyRecord(commit, () => Promise.resolve(record));
                },
                notify: (notice) => {
                    try {
                        interaction.notify(notice);
                    }
                    catch (error) {
                        // Fire-and-forget is held at the seam: a surface that cannot
                        // render a notice (a page whose connection just closed) loses the
                        // notice, never the attempt.
                        this.ctx.logger.warn('authorization: the interaction surface failed to render a notice');
                        this.ctx.logger.warn(error);
                    }
                },
                prompt: prompt => interaction.prompt(prompt).catch((error) => {
                    if (error instanceof AuthorizationDeclinedError)
                        observed.declined = true;
                    throw error;
                }),
            });
            try {
                if (await Promise.race([running.then(() => 'ran'), withdrawn]) === 'withdrawn') {
                    // Nothing awaits the orphan any more, so its eventual failure has to be
                    // marked handled or it would take down the process.
                    void running.catch(() => { this.ctx.logger.debug('authorization: withdrawn flow failed after the fact'); });
                    return { status: 'cancelled', key: commit };
                }
            }
            catch (error) {
                // A withdrawn attempt and a declined prompt are outcomes, not
                // failures: the human said no, or closed the page. Anything else is
                // the flow failing and belongs to the caller, cause chain intact.
                if (signal.aborted || observed.declined)
                    return { status: 'cancelled', key: commit };
                throw error;
            }
        }
        finally {
            unwatch();
        }
        if (!observed.committed) {
            throw new AuthorizationError(`authorization flow for "${flow.key}" resolved without committing a credential record in this attempt`, 'NOT_COMMITTED');
        }
        const stored = await this.ctx.credentials.describeRecord(commit);
        if (!stored.configured) {
            throw new AuthorizationError(`authorization flow for "${flow.key}" deleted its credential record instead of committing one`, 'NOT_COMMITTED');
        }
        await this.removeDuplicateAccounts(flow, commit);
        // A freshly authorized account becomes the selected one: the human who
        // just completed sign-in is the account they mean to use, and a surface
        // would otherwise have to find the new slot and name it back.
        if (account !== undefined) {
            await this.writeSelection(flow.key, account);
        }
        return { status: 'authorized', key: commit };
    }
    /**
     * Collapse the flow's other stored records that report the just-committed
     * account's identity: signing back into an account that is already stored
     * refreshes it instead of leaving a second entry. The committed record is
     * the survivor — the fresher grant — and its sibling's removal rides the
     * same `record-updated` event stream the commit did, so surfaces simply
     * stop listing it. A flow without `describeRecord`, or a record without
     * an `identity`, cannot prove two records are the same account and keeps
     * each sign-in as its own, as before.
     * @param flow - the flow whose attempt committed.
     * @param commit - the record key the attempt committed.
     */
    async removeDuplicateAccounts(flow, commit) {
        if (flow.describeRecord === undefined)
            return;
        const committed = await this.ctx.credentials.readRecord(commit);
        /* v8 ignore next -- the commit contract just confirmed this record is
           configured; the guard covers a delete racing the seam's own bookkeeping */
        if (committed === undefined)
            return;
        const identity = flow.describeRecord(committed).identity;
        if (identity === undefined)
            return;
        const scope = credentialKeyScope(flow.key);
        const id = credentialKeyId(flow.key);
        for (const slot of await storedAccountSlots(this.ctx.credentials, flow.key)) {
            const sibling = slot === '' ? flow.key : credentialKey(scope, accountRecordId(id, slot));
            if (sibling === commit)
                continue;
            const record = await this.ctx.credentials.readRecord(sibling);
            if (record !== undefined && flow.describeRecord(record).identity === identity) {
                await this.ctx.credentials.deleteRecord(sibling);
            }
        }
    }
}
export default AuthorizationService;
//# sourceMappingURL=index.js.map