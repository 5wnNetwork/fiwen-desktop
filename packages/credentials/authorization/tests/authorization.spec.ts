import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialRecord } from '@deepseek-ai/dsh-credentials'
import AuthorizationService, {
  AuthorizationDeclinedError,
  accountSelectionOf,
  accountSlotOf,
  flowKeyOf,
  resolveRecordKey,
  selectionKeyFor,
  type AuthorizationFlow,
  type AuthorizationInteraction,
  type AuthorizationSession,
} from '@deepseek-ai/dsh-authorization'
import { MemoryCredentials } from './memory.ts'

const KEY = credentialKey('llm-pi-ai', 'openai-codex')
const OTHER = credentialKey('llm-pi-ai', 'anthropic')
const SLOT_A = credentialKey('llm-pi-ai', 'openai-codex--acct-a')
const SLOT_B = credentialKey('llm-pi-ai', 'openai-codex--acct-b')

/** A context with the record store the seam confirms commits against. */
async function harness(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(MemoryCredentials)
  await ctx.plugin(AuthorizationService)
  return ctx
}

/** An interaction that answers every prompt with the same string. */
function surface(answer = 'typed'): AuthorizationInteraction & {
  notices: unknown[]
  prompts: unknown[]
} {
  const notices: unknown[] = []
  const prompts: unknown[] = []
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

/** A flow that commits `key` through the record store and then resolves. */
function committingFlow(
  ctx: Context,
  key = KEY,
  run?: (session: AuthorizationSession) => Promise<void>,
): AuthorizationFlow {
  return {
    key,
    label: 'ChatGPT (Codex)',
    methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }, { id: 'api-key', label: 'Paste a key' }],
    async run(session) {
      await run?.(session)
      await ctx.credentials.modifyRecord(key, () =>
        Promise.resolve({ kind: 'grant', payload: { token: 'granted' } }))
    },
  }
}

describe('AuthorizationService registry', () => {
  it('lists a registered flow and drops it when the registration is disposed', async () => {
    const ctx = await harness()

    const dispose = ctx.authorization.registerFlow(committingFlow(ctx))

    expect(ctx.authorization.list()).toEqual([{
      key: KEY,
      label: 'ChatGPT (Codex)',
      methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }, { id: 'api-key', label: 'Paste a key' }],
      inFlight: false,
    }])
    expect(ctx.authorization.describe(KEY)?.label).toBe('ChatGPT (Codex)')
    expect(ctx.authorization.describe(OTHER)).toBeUndefined()

    dispose()

    expect(ctx.authorization.list()).toEqual([])
    expect(ctx.authorization.describe(KEY)).toBeUndefined()
  })

  it('refuses a second flow for the same key', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(committingFlow(ctx))

    expect(() => ctx.authorization.registerFlow(committingFlow(ctx)))
      .toThrow(/already registered/)
  })

  it('withdraws an attempt still running when its flow leaves', async () => {
    const ctx = await harness()
    let started: (() => void) | undefined
    const running = new Promise<void>((resolve) => {
      started = resolve
    })
    const dispose = ctx.authorization.registerFlow(committingFlow(ctx, KEY, session =>
      new Promise((_resolve, reject) => {
        started?.()
        session.signal.addEventListener('abort', () => { reject(new Error('withdrawn')) }, { once: true })
      })))

    const attempt = ctx.authorization.begin({ key: KEY, interaction: surface() })
    await running
    dispose()

    await expect(attempt).resolves.toEqual({ status: 'cancelled', key: KEY })
  })
})

/**
 * A flow that commits the record its session's account slot names, labels its
 * records by the `email` inside the payload it wrote, and answers a fixed
 * quota. Mirrors how a provider plugin is expected to use the seam: the slot
 * on the session is the only input the flow needs to place its commit.
 */
function accountFlow(ctx: Context): AuthorizationFlow {
  return {
    key: KEY,
    label: 'ChatGPT (Codex)',
    methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }],
    async run(session) {
      const id = session.account === undefined ? 'openai-codex' : `openai-codex--${session.account}`
      const email = session.account === undefined ? 'base@example.com' : `${session.account}@example.com`
      await ctx.credentials.modifyRecord(credentialKey('llm-pi-ai', id), () =>
        Promise.resolve({ kind: 'grant', payload: { token: 'granted', email } }))
    },
    describeRecord(record: CredentialRecord) {
      if (record.kind !== 'grant') return {}
      const payload = record.payload as { email?: unknown; expires?: unknown }
      return {
        ...typeof payload.email === 'string'
          ? { label: payload.email, identity: payload.email.toLowerCase() }
          : {},
        ...typeof payload.expires === 'number' ? { expiresAt: payload.expires } : {},
      }
    },
    async quota({ payload, persist }) {
      const token = (payload as { token?: unknown }).token
      if (token !== 'granted') return undefined
      await persist({ token: 'rotated' })
      return {
        windows: [{ id: 'five-hour', label: '5 hour', usedPercent: 42 }],
        fetchedAt: 1,
      }
    },
  }
}

describe('account key helpers', () => {
  it('derives and reads back account record ids', () => {
    expect(accountSlotOf('openai-codex--acct-a')).toBe('acct-a')
    expect(accountSlotOf('openai-codex')).toBeUndefined()
    expect(flowKeyOf(SLOT_A)).toBe(KEY)
    expect(flowKeyOf(KEY)).toBe(KEY)
    expect(selectionKeyFor(KEY)).toBe(credentialKey('llm-pi-ai', 'openai-codex--selected'))
  })

  it('reads a selection pointer only when its payload carries a string account', () => {
    expect(accountSelectionOf(undefined)).toBeUndefined()
    expect(accountSelectionOf({ kind: 'api-key', key: 'sk' })).toBeUndefined()
    expect(accountSelectionOf({ kind: 'grant', payload: 'plain' })).toBeUndefined()
    expect(accountSelectionOf({ kind: 'grant', payload: { account: 5 } })).toBeUndefined()
    expect(accountSelectionOf({ kind: 'grant', payload: { account: 'acct-a' } })).toBe('acct-a')
    expect(accountSelectionOf({ kind: 'grant', payload: { account: '' } })).toBe('')
  })

  it('resolves a base key through the selection pointer and passes a slotted key through', async () => {
    const ctx = await harness()
    // Records outside the flow's scope and ids outside its slot space must
    // never enter slot enumeration.
    await ctx.credentials.modifyRecord(credentialKey('other-scope', 'openai-codex'), () =>
      Promise.resolve({ kind: 'grant', payload: {} }))
    await ctx.credentials.modifyRecord(credentialKey('llm-pi-ai', 'unrelated'), () =>
      Promise.resolve({ kind: 'grant', payload: {} }))
    // Nothing stored for the key still answers the base key: a first write creates it.
    await expect(resolveRecordKey(ctx.credentials, KEY)).resolves.toBe(KEY)
    await ctx.credentials.modifyRecord(SLOT_A, () => Promise.resolve({ kind: 'grant', payload: {} }))
    await ctx.credentials.modifyRecord(selectionKeyFor(KEY), () =>
      Promise.resolve({ kind: 'grant', payload: { account: 'acct-a' } }))
    await expect(resolveRecordKey(ctx.credentials, KEY)).resolves.toBe(SLOT_A)
    // A slotted key addresses itself regardless of the pointer.
    await expect(resolveRecordKey(ctx.credentials, SLOT_B)).resolves.toBe(SLOT_B)
    // A pointer that names a vanished account resolves to the remaining base record.
    await ctx.credentials.deleteRecord(SLOT_A)
    await ctx.credentials.modifyRecord(KEY, () => Promise.resolve({ kind: 'grant', payload: {} }))
    await expect(resolveRecordKey(ctx.credentials, KEY)).resolves.toBe(KEY)
    // ...and to a surviving account when even the base record is gone.
    await ctx.credentials.modifyRecord(SLOT_B, () => Promise.resolve({ kind: 'grant', payload: {} }))
    await ctx.credentials.deleteRecord(KEY)
    await expect(resolveRecordKey(ctx.credentials, KEY)).resolves.toBe(SLOT_B)
  })
})

describe('account slots', () => {
  it('commits an account attempt under its own key and selects it', async () => {
    const ctx = await harness()
    const base = accountFlow(ctx)
    const seen: Array<string | undefined> = []
    ctx.authorization.registerFlow({
      ...base,
      run: (session) => { seen.push(session.account); return base.run(session) },
    })

    const outcome = await ctx.authorization.begin({ key: KEY, account: 'acct-a', interaction: surface() })

    expect(seen).toEqual(['acct-a'])
    expect(outcome).toEqual({ status: 'authorized', key: SLOT_A })
    expect(await ctx.credentials.readRecord(SLOT_A))
      .toEqual({ kind: 'grant', payload: { token: 'granted', email: 'acct-a@example.com' } })
    expect(await ctx.credentials.readRecord(KEY)).toBeUndefined()
    expect(await ctx.credentials.readRecord(selectionKeyFor(KEY)))
      .toEqual({ kind: 'grant', payload: { account: 'acct-a' } })
  })

  it('drops the already-stored entry when a sign-in commits the same account identity', async () => {
    const ctx = await harness()
    const base = accountFlow(ctx)
    ctx.authorization.registerFlow({
      ...base,
      // Whatever slot the surface mints, this sign-in always lands the same
      // upstream account — dedup keys on the identity the record reports.
      describeRecord: (record: CredentialRecord) => record.kind === 'grant'
        ? { label: 'same@x.dev', identity: 'same@x.dev' }
        : {},
    })

    await ctx.authorization.begin({ key: KEY, account: 'acct-a', interaction: surface() })
    await ctx.authorization.begin({ key: KEY, account: 'acct-b', interaction: surface() })

    await expect(ctx.authorization.listAccounts(KEY)).resolves.toEqual([
      { key: SLOT_B, account: 'acct-b', label: 'same@x.dev', selected: true },
    ])
    expect(await ctx.credentials.describeRecord(SLOT_A)).toMatchObject({ configured: false })
  })

  it('removes a stored account whose identity a base-record commit reports', async () => {
    const ctx = await harness()
    const base = accountFlow(ctx)
    ctx.authorization.registerFlow({
      ...base,
      describeRecord: (record: CredentialRecord) => record.kind === 'grant'
        ? { label: 'who@x.dev', identity: 'who@x.dev' }
        : {},
    })
    await ctx.credentials.modifyRecord(SLOT_A, () =>
      Promise.resolve({ kind: 'grant', payload: { token: 'a', email: 'who@x.dev' } }))

    await ctx.authorization.begin({ key: KEY, interaction: surface() })

    expect(await ctx.credentials.describeRecord(SLOT_A)).toMatchObject({ configured: false })
    await expect(ctx.authorization.listAccounts(KEY)).resolves.toEqual([
      { key: KEY, account: '', label: 'who@x.dev', selected: true },
    ])
  })

  it('keeps each sign-in as its own account when the record reports no identity', async () => {
    const ctx = await harness()
    const base = accountFlow(ctx)
    ctx.authorization.registerFlow({ ...base, describeRecord: () => ({}) })

    await ctx.authorization.begin({ key: KEY, account: 'acct-a', interaction: surface() })
    await ctx.authorization.begin({ key: KEY, account: 'acct-b', interaction: surface() })

    await expect(ctx.authorization.listAccounts(KEY)).resolves.toHaveLength(2)
  })

  it('reports the credential expiry a flow reads off its record', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(accountFlow(ctx))
    await ctx.credentials.modifyRecord(SLOT_A, () => Promise.resolve({
      kind: 'grant',
      payload: { token: 'a', email: 'a@x.dev', expires: 1_700_000_000_000 },
    }))

    await expect(ctx.authorization.listAccounts(KEY)).resolves.toEqual([
      { key: SLOT_A, account: 'acct-a', label: 'a@x.dev', expiresAt: 1_700_000_000_000, selected: true },
    ])
  })

  it('lists records bare when the flow reads nothing off them', async () => {
    const ctx = await harness()
    // committingFlow carries no describeRecord: the list still reports the
    // slots, just without a label or expiry to show.
    ctx.authorization.registerFlow(committingFlow(ctx))
    await ctx.credentials.modifyRecord(SLOT_A, () =>
      Promise.resolve({ kind: 'grant', payload: { token: 'a' } }))

    await expect(ctx.authorization.listAccounts(KEY)).resolves.toEqual([
      { key: SLOT_A, account: 'acct-a', selected: true },
    ])
  })

  it('ignores a sibling record that vanishes while a sign-in dedups', async () => {
    const ctx = await harness()
    const base = accountFlow(ctx)
    ctx.authorization.registerFlow({
      ...base,
      describeRecord: (record: CredentialRecord) => record.kind === 'grant'
        ? { label: 'same@x.dev', identity: 'same@x.dev' }
        : {},
    })
    await ctx.credentials.modifyRecord(SLOT_A, () =>
      Promise.resolve({ kind: 'grant', payload: { token: 'a', email: 'same@x.dev' } }))
    // A slot listed by the dedup enumeration but gone by the read.
    const ghost = credentialKey('llm-pi-ai', 'openai-codex--ghost')
    const real = ctx.credentials.listRecords.bind(ctx.credentials)
    const listed = vi.spyOn(ctx.credentials, 'listRecords')
      .mockImplementation(async () => [...await real(), { key: ghost, kind: 'grant' }])

    await ctx.authorization.begin({ key: KEY, account: 'acct-b', interaction: surface() })
    listed.mockRestore()

    await expect(ctx.authorization.listAccounts(KEY)).resolves.toEqual([
      { key: SLOT_B, account: 'acct-b', label: 'same@x.dev', selected: true },
    ])
  })

  it('refuses an account attempt whose commit lands on the base key', async () => {
    const ctx = await harness()
    // A flow that ignores session.account commits the base record, which is
    // not the record this attempt must produce.
    ctx.authorization.registerFlow(committingFlow(ctx))

    await expect(ctx.authorization.begin({ key: KEY, account: 'acct-a', interaction: surface() }))
      .rejects.toThrow(/resolved without committing a credential record/)
  })

  it.each(['Selected', '-x', 'acct_a', 'selected'])(
    'refuses the account slot "%s" before the flow runs', async (account) => {
      const ctx = await harness()
      const ran = vi.fn()
      ctx.authorization.registerFlow({
        key: KEY,
        label: 'Watcher',
        methods: [{ id: 'oauth', label: 'Sign in' }],
        run: () => { ran(); return Promise.resolve() },
      })

      await expect(ctx.authorization.begin({ key: KEY, account, interaction: surface() }))
        .rejects.toThrow(/not a credential-key segment/)
      expect(ran).not.toHaveBeenCalled()
    })

  it('lists the base record and each stored account with its label and selection', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(accountFlow(ctx))
    await ctx.credentials.modifyRecord(KEY, () =>
      Promise.resolve({ kind: 'grant', payload: { token: 'base', email: 'base@example.com' } }))
    await ctx.credentials.modifyRecord(SLOT_A, () =>
      Promise.resolve({ kind: 'grant', payload: { token: 'a', email: 'a@example.com' } }))
    await ctx.credentials.modifyRecord(SLOT_B, () =>
      Promise.resolve({ kind: 'grant', payload: { token: 'b' } }))
    // The pointer is a record in the same space; it must never list as an account.
    await ctx.credentials.modifyRecord(selectionKeyFor(KEY), () =>
      Promise.resolve({ kind: 'grant', payload: { account: 'acct-b' } }))
    await ctx.credentials.modifyRecord(OTHER, () =>
      Promise.resolve({ kind: 'grant', payload: { token: 'other' } }))

    await expect(ctx.authorization.listAccounts(KEY)).resolves.toEqual([
      { key: KEY, account: '', label: 'base@example.com', selected: false },
      { key: SLOT_A, account: 'acct-a', label: 'a@example.com', selected: false },
      { key: SLOT_B, account: 'acct-b', selected: true },
    ])
  })

  it('marks the base record selected while no pointer is stored', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(accountFlow(ctx))
    await ctx.credentials.modifyRecord(KEY, () =>
      Promise.resolve({ kind: 'grant', payload: { token: 'base' } }))
    await ctx.credentials.modifyRecord(SLOT_A, () =>
      Promise.resolve({ kind: 'grant', payload: { token: 'a' } }))

    const accounts = await ctx.authorization.listAccounts(KEY)

    expect(accounts.map(account => account.selected)).toEqual([true, false])
  })

  it('moves the selection with selectAccount and refuses slots nothing stores', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(accountFlow(ctx))
    await ctx.credentials.modifyRecord(SLOT_A, () =>
      Promise.resolve({ kind: 'grant', payload: { token: 'a' } }))

    await ctx.authorization.selectAccount(KEY, 'acct-a')
    expect(await ctx.credentials.readRecord(selectionKeyFor(KEY)))
      .toEqual({ kind: 'grant', payload: { account: 'acct-a' } })
    await expect(ctx.authorization.selectAccount(KEY, 'acct-gone'))
      .rejects.toThrow(/no account "acct-gone" is stored/)
    await expect(ctx.authorization.selectAccount(KEY, 'selected'))
      .rejects.toThrow(/not a credential-key segment/)
    await expect(ctx.authorization.selectAccount(OTHER, 'acct-a'))
      .rejects.toThrow(/no authorization flow is registered/)
  })

  it('selects the base record through the empty slot', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(accountFlow(ctx))
    await ctx.credentials.modifyRecord(KEY, () =>
      Promise.resolve({ kind: 'grant', payload: { token: 'base' } }))

    await ctx.authorization.selectAccount(KEY, '')

    expect(await ctx.credentials.readRecord(selectionKeyFor(KEY)))
      .toEqual({ kind: 'grant', payload: { account: '' } })
  })

  it('falls back to the base record when the pointer names a deleted account', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(accountFlow(ctx))
    await ctx.credentials.modifyRecord(KEY, () =>
      Promise.resolve({ kind: 'grant', payload: { token: 'base', email: 'base@example.com' } }))
    await ctx.credentials.modifyRecord(selectionKeyFor(KEY), () =>
      Promise.resolve({ kind: 'grant', payload: { account: 'acct-gone' } }))

    const accounts = await ctx.authorization.listAccounts(KEY)

    expect(accounts).toEqual([{ key: KEY, account: '', label: 'base@example.com', selected: true }])
  })

  it('answers a named account\'s quota and writes its refresh back to that record', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(accountFlow(ctx))
    await ctx.credentials.modifyRecord(SLOT_A, () =>
      Promise.resolve({ kind: 'grant', payload: { token: 'granted' } }))

    await expect(ctx.authorization.quota(KEY, 'acct-a')).resolves.toEqual({
      windows: [{ id: 'five-hour', label: '5 hour', usedPercent: 42 }],
      fetchedAt: 1,
    })
    expect(await ctx.credentials.readRecord(SLOT_A))
      .toEqual({ kind: 'grant', payload: { token: 'rotated' } })
  })

  it('answers quota for the selected account when none is named', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(accountFlow(ctx))
    await ctx.credentials.modifyRecord(SLOT_A, () =>
      Promise.resolve({ kind: 'grant', payload: { token: 'granted' } }))
    await ctx.authorization.selectAccount(KEY, 'acct-a')

    await expect(ctx.authorization.quota(KEY)).resolves.toMatchObject({
      windows: [{ id: 'five-hour', label: '5 hour', usedPercent: 42 }],
    })
  })

  it('does not resurrect an account deleted while its quota probe ran', async () => {
    const ctx = await harness()
    const base = accountFlow(ctx)
    ctx.authorization.registerFlow({
      ...base,
      async quota({ persist }) {
        // The account leaves while the probe is in flight; its refresh must
        // not land on a record that is gone.
        await ctx.credentials.deleteRecord(SLOT_A)
        await persist({ token: 'rotated' })
        return { windows: [], fetchedAt: 1 }
      },
    })
    await ctx.credentials.modifyRecord(SLOT_A, () =>
      Promise.resolve({ kind: 'grant', payload: { token: 'granted' } }))

    await expect(ctx.authorization.quota(KEY, 'acct-a')).resolves.toEqual({ windows: [], fetchedAt: 1 })
    expect(await ctx.credentials.readRecord(SLOT_A)).toBeUndefined()
  })

  it('answers no quota from a flow that offers none', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(committingFlow(ctx))
    await ctx.credentials.modifyRecord(KEY, () =>
      Promise.resolve({ kind: 'grant', payload: { token: 'granted' } }))

    await expect(ctx.authorization.quota(KEY)).resolves.toBeUndefined()
  })

  it('refuses the account surface for a key no flow claims', async () => {
    const ctx = await harness()

    await expect(ctx.authorization.listAccounts(OTHER)).rejects.toThrow(/no authorization flow/)
    await expect(ctx.authorization.selectAccount(OTHER, 'acct-a')).rejects.toThrow(/no authorization flow/)
    await expect(ctx.authorization.quota(OTHER, 'acct-a')).rejects.toThrow(/no authorization flow/)
  })

  it('refuses reserved and malformed account slots', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(accountFlow(ctx))

    await expect(ctx.authorization.selectAccount(KEY, 'selected')).rejects.toThrow(/not a credential-key segment/)
    await expect(ctx.authorization.selectAccount(KEY, 'Bad Slot')).rejects.toThrow(/not a credential-key segment/)
    await expect(ctx.authorization.quota(KEY, 'selected')).rejects.toThrow(/not a credential-key segment/)
    await expect(ctx.authorization.quota(KEY, 'bad!slot')).rejects.toThrow(/not a credential-key segment/)
  })

  it('lists only the flow\'s own scope and slot-shaped records', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(accountFlow(ctx))
    await ctx.credentials.modifyRecord(KEY, () => Promise.resolve({ kind: 'grant', payload: { email: 'b@x.dev' } }))
    await ctx.credentials.modifyRecord(SLOT_A, () => Promise.resolve({ kind: 'grant', payload: { email: 'a@x.dev' } }))
    // A record in another scope, an unrelated id in the flow's scope, and an
    // id whose suffix is no account slot must all stay out of the list.
    await ctx.credentials.modifyRecord(credentialKey('other-scope', 'openai-codex'), () =>
      Promise.resolve({ kind: 'grant', payload: {} }))
    await ctx.credentials.modifyRecord(credentialKey('llm-pi-ai', 'unrelated'), () =>
      Promise.resolve({ kind: 'grant', payload: {} }))
    await ctx.credentials.modifyRecord(credentialKey('llm-pi-ai', 'openai-codex---x'), () =>
      Promise.resolve({ kind: 'grant', payload: {} }))

    await expect(ctx.authorization.listAccounts(KEY)).resolves.toEqual([
      { key: KEY, account: '', label: 'b@x.dev', selected: true },
      { key: SLOT_A, account: 'acct-a', label: 'a@x.dev', selected: false },
    ])
  })

  it('skips an account whose record vanished between listing and reading', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(accountFlow(ctx))
    await ctx.credentials.modifyRecord(SLOT_A, () => Promise.resolve({ kind: 'grant', payload: { email: 'a@x.dev' } }))
    const ghost = credentialKey('llm-pi-ai', 'openai-codex--ghost')
    const listed = vi.spyOn(ctx.credentials, 'listRecords')
      .mockImplementationOnce(async () => [...await ctx.credentials.listRecords(), { key: ghost, kind: 'grant' }])

    await expect(ctx.authorization.listAccounts(KEY)).resolves.toEqual([
      { key: SLOT_A, account: 'acct-a', label: 'a@x.dev', selected: true },
    ])
    listed.mockRestore()
  })

  it('answers quota for the base record through the empty slot and nothing when nothing is stored', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(accountFlow(ctx))
    await ctx.credentials.modifyRecord(KEY, () =>
      Promise.resolve({ kind: 'grant', payload: { token: 'granted' } }))

    await expect(ctx.authorization.quota(KEY, '')).resolves.toEqual({
      windows: [{ id: 'five-hour', label: '5 hour', usedPercent: 42 }],
      fetchedAt: 1,
    })

    const empty = await harness()
    empty.authorization.registerFlow(accountFlow(empty))
    await expect(empty.authorization.quota(KEY)).resolves.toBeUndefined()
  })

  it('answers no quota for a record that is not a grant', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(accountFlow(ctx))
    await ctx.credentials.modifyRecord(SLOT_A, () => Promise.resolve({ kind: 'api-key', key: 'sk' }))

    await expect(ctx.authorization.quota(KEY, 'acct-a')).resolves.toBeUndefined()
  })
})

describe('AuthorizationService.begin', () => {
  it('runs the flow, confirms the committed record, and reports the settlement', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(committingFlow(ctx))
    const settled = vi.fn()
    ctx.on('authorization/settled', settled)

    await expect(ctx.authorization.begin({ key: KEY, interaction: surface() }))
      .resolves.toEqual({ status: 'authorized', key: KEY })

    expect(await ctx.credentials.readRecord(KEY)).toEqual({ kind: 'grant', payload: { token: 'granted' } })
    expect(settled).toHaveBeenCalledWith(KEY, 'authorized')
  })

  it('runs the flow first method when the caller names none, and the named one when it does', async () => {
    const ctx = await harness()
    const seen: string[] = []
    ctx.authorization.registerFlow(committingFlow(ctx, KEY, (session) => {
      seen.push(session.method)
      return Promise.resolve()
    }))

    await ctx.authorization.begin({ key: KEY, interaction: surface() })
    await ctx.authorization.begin({ key: KEY, method: 'api-key', interaction: surface() })

    expect(seen).toEqual(['oauth', 'api-key'])
  })

  it('carries notices and prompts between the flow and the calling surface', async () => {
    const ctx = await harness()
    const answers: string[] = []
    ctx.authorization.registerFlow(committingFlow(ctx, KEY, async (session) => {
      session.notify({ message: 'Continue in your browser', url: 'https://auth.example/start' })
      answers.push(await session.prompt({ kind: 'text', message: 'Paste the code' }))
    }))
    const ui = surface('code-123')

    await ctx.authorization.begin({ key: KEY, interaction: ui })

    expect(ui.notices).toEqual([{ message: 'Continue in your browser', url: 'https://auth.example/start' }])
    expect(ui.prompts).toEqual([{ kind: 'text', message: 'Paste the code' }])
    expect(answers).toEqual(['code-123'])
  })

  it('refuses a key no flow claims', async () => {
    const ctx = await harness()

    await expect(ctx.authorization.begin({ key: KEY, interaction: surface() }))
      .rejects.toThrow(/no authorization flow is registered/)
  })

  it('refuses a method the flow does not offer', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(committingFlow(ctx))

    await expect(ctx.authorization.begin({ key: KEY, method: 'device', interaction: surface() }))
      .rejects.toThrow(/offers no method "device"/)
  })

  it('refuses a second attempt while one is running, and admits one after it settles', async () => {
    const ctx = await harness()
    // Only the first attempt blocks; the later ones must be free to complete,
    // which is what shows the key was released rather than merely idle-looking.
    const held = Promise.withResolvers<undefined>()
    const started = Promise.withResolvers<undefined>()
    let first = true
    ctx.authorization.registerFlow(committingFlow(ctx, KEY, () => {
      if (!first) return Promise.resolve()
      first = false
      started.resolve(undefined)
      return held.promise
    }))

    const attempt = ctx.authorization.begin({ key: KEY, interaction: surface() })
    await started.promise
    expect(ctx.authorization.describe(KEY)?.inFlight).toBe(true)
    await expect(ctx.authorization.begin({ key: KEY, interaction: surface() }))
      .rejects.toThrow(/already running/)

    held.resolve(undefined)
    await expect(attempt).resolves.toEqual({ status: 'authorized', key: KEY })
    expect(ctx.authorization.describe(KEY)?.inFlight).toBe(false)
    await expect(ctx.authorization.begin({ key: KEY, interaction: surface() }))
      .resolves.toEqual({ status: 'authorized', key: KEY })
  })

  it('never starts a flow whose caller withdrew before begin', async () => {
    const ctx = await harness()
    const ran = vi.fn()
    const settled = vi.fn()
    ctx.on('authorization/settled', settled)
    ctx.authorization.registerFlow(committingFlow(ctx, KEY, () => {
      ran()
      return new Promise(() => {})
    }))

    await expect(ctx.authorization.begin({
      key: KEY,
      interaction: surface(),
      signal: AbortSignal.abort(),
    })).resolves.toEqual({ status: 'cancelled', key: KEY })

    expect(ran).not.toHaveBeenCalled()
    // Nothing occupied the key, so nothing settled on it either.
    expect(settled).not.toHaveBeenCalled()
    expect(ctx.authorization.describe(KEY)?.inFlight).toBe(false)
  })

  it('still reports an unknown method to a caller that already withdrew', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(committingFlow(ctx))

    await expect(ctx.authorization.begin({
      key: KEY,
      method: 'device',
      interaction: surface(),
      signal: AbortSignal.abort(),
    })).rejects.toThrow(/offers no method "device"/)
  })

  it('reports a caller that withdraws mid-flight as cancelled', async () => {
    const ctx = await harness()
    const controller = new AbortController()
    const reason = new Error('caller withdrew')
    let received: unknown
    ctx.authorization.registerFlow(committingFlow(ctx, KEY, session =>
      new Promise((_resolve, reject) => {
        session.signal.addEventListener('abort', () => { received = session.signal.reason; reject(reason) }, { once: true })
        controller.abort(reason)
      })))

    await expect(ctx.authorization.begin({ key: KEY, interaction: surface(), signal: controller.signal }))
      .resolves.toEqual({ status: 'cancelled', key: KEY })
    expect(received).toBe(reason)
  })

  it('withdraws a running attempt through cancel(), and ignores cancel() for an idle key', async () => {
    const ctx = await harness()
    const started = Promise.withResolvers<undefined>()
    ctx.authorization.registerFlow(committingFlow(ctx, KEY, session =>
      new Promise((_resolve, reject) => {
        session.signal.addEventListener('abort', () => { reject(new Error('cancelled')) }, { once: true })
        started.resolve(undefined)
      })))
    ctx.authorization.cancel(OTHER)

    const attempt = ctx.authorization.begin({ key: KEY, interaction: surface() })
    await started.promise
    ctx.authorization.cancel(KEY)

    await expect(attempt).resolves.toEqual({ status: 'cancelled', key: KEY })
  })

  it('settles a withdrawn attempt even when its flow never reacts to the signal', async () => {
    const ctx = await harness()
    const orphan = Promise.withResolvers<undefined>()
    const started = Promise.withResolvers<undefined>()
    ctx.authorization.registerFlow(committingFlow(ctx, KEY, () => {
      started.resolve(undefined)
      return orphan.promise
    }))

    const attempt = ctx.authorization.begin({ key: KEY, interaction: surface() })
    await started.promise
    ctx.authorization.cancel(KEY)

    await expect(attempt).resolves.toEqual({ status: 'cancelled', key: KEY })
    // The key is free again immediately, rather than at the mercy of a flow
    // that may never settle.
    expect(ctx.authorization.describe(KEY)?.inFlight).toBe(false)
    // The orphan's own failure is nobody's to await, and must not surface as an
    // unhandled rejection.
    orphan.reject(new Error('gave up long after the human left'))
    await expect(orphan.promise).rejects.toThrow('gave up long after the human left')
  })

  it('propagates a flow failure to its caller and settles the key as failed', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(committingFlow(ctx, KEY, () =>
      Promise.reject(new Error('the token endpoint said no'))))
    const settled = vi.fn()
    ctx.on('authorization/settled', settled)

    await expect(ctx.authorization.begin({ key: KEY, interaction: surface() }))
      .rejects.toThrow('the token endpoint said no')

    expect(settled).toHaveBeenCalledWith(KEY, 'failed')
    expect(ctx.authorization.describe(KEY)?.inFlight).toBe(false)
  })

  it('refuses a flow that resolves without committing its record', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow({
      key: KEY,
      label: 'Forgetful',
      methods: [{ id: 'oauth', label: 'Sign in' }],
      run: () => Promise.resolve(),
    })

    await expect(ctx.authorization.begin({ key: KEY, interaction: surface() }))
      .rejects.toThrow(/resolved without committing a credential record/)
  })
})

describe('commit confirmation', () => {
  it('refuses a re-auth that left only the record of an earlier attempt', async () => {
    const ctx = await harness()
    await ctx.credentials.modifyRecord(KEY, () =>
      Promise.resolve({ kind: 'grant', payload: { token: 'stale' } }))
    ctx.authorization.registerFlow({
      key: KEY,
      label: 'Forgetful',
      methods: [{ id: 'oauth', label: 'Sign in' }],
      // A commit for another key is not this flow's commit either.
      async run() {
        await ctx.credentials.modifyRecord(OTHER, () =>
          Promise.resolve({ kind: 'grant', payload: { token: 'other' } }))
      },
    })

    await expect(ctx.authorization.begin({ key: KEY, interaction: surface() }))
      .rejects.toThrow(/without committing a credential record in this attempt/)
    // Refused, not cleaned up: the stale record still belongs to its owner.
    expect(await ctx.credentials.readRecord(KEY)).toEqual({ kind: 'grant', payload: { token: 'stale' } })
  })

  it('refuses a flow that deleted its record instead of committing one', async () => {
    const ctx = await harness()
    await ctx.credentials.modifyRecord(KEY, () =>
      Promise.resolve({ kind: 'grant', payload: { token: 'stale' } }))
    ctx.authorization.registerFlow({
      key: KEY,
      label: 'Destructive',
      methods: [{ id: 'oauth', label: 'Sign in' }],
      run: () => ctx.credentials.deleteRecord(KEY),
    })

    await expect(ctx.authorization.begin({ key: KEY, interaction: surface() }))
      .rejects.toThrow(/deleted its credential record/)
  })
})

describe('declined prompts', () => {
  it('reports an attempt whose prompt the human declined as cancelled, not failed', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(committingFlow(ctx, KEY, async (session) => {
      await session.prompt({ kind: 'text', message: 'Paste the code' })
    }))
    const settled = vi.fn()
    ctx.on('authorization/settled', settled)
    const declining: AuthorizationInteraction = {
      notify: () => undefined,
      prompt: () => Promise.reject(new AuthorizationDeclinedError()),
    }

    await expect(ctx.authorization.begin({ key: KEY, interaction: declining }))
      .resolves.toEqual({ status: 'cancelled', key: KEY })

    expect(settled).toHaveBeenCalledWith(KEY, 'cancelled')
  })

  it('reads a decline through a flow that rewraps the rejection on its way out', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(committingFlow(ctx, KEY, session =>
      session.prompt({ kind: 'text', message: 'Paste the code' }).then(
        () => undefined,
        () => {
          throw new Error('sign-in aborted')
        })))
    const declining: AuthorizationInteraction = {
      notify: () => undefined,
      prompt: () => Promise.reject(new AuthorizationDeclinedError()),
    }

    await expect(ctx.authorization.begin({ key: KEY, interaction: declining }))
      .resolves.toEqual({ status: 'cancelled', key: KEY })
  })

  it('keeps a prompt failure that is not a decline a flow failure', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(committingFlow(ctx, KEY, async (session) => {
      await session.prompt({ kind: 'text', message: 'Paste the code' })
    }))
    const settled = vi.fn()
    ctx.on('authorization/settled', settled)
    const broken: AuthorizationInteraction = {
      notify: () => undefined,
      prompt: () => Promise.reject(new Error('the transport dropped')),
    }

    await expect(ctx.authorization.begin({ key: KEY, interaction: broken }))
      .rejects.toThrow('the transport dropped')

    expect(settled).toHaveBeenCalledWith(KEY, 'failed')
  })
})

describe('notice containment', () => {
  it('loses the notice, never the attempt, when the surface cannot render it', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(committingFlow(ctx, KEY, (session) => {
      session.notify({ message: 'Continue in your browser' })
      return Promise.resolve()
    }))
    const broken: AuthorizationInteraction = {
      notify: () => {
        throw new Error('page connection closed')
      },
      prompt: () => Promise.resolve('unused'),
    }

    await expect(ctx.authorization.begin({ key: KEY, interaction: broken }))
      .resolves.toEqual({ status: 'authorized', key: KEY })
  })
})

describe('the settled fan-out', () => {
  it('keeps a throwing listener from changing a finished attempt, and later listeners still run', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(committingFlow(ctx))
    ctx.on('authorization/settled', () => {
      throw new Error('watcher boom')
    })
    const second = vi.fn()
    ctx.on('authorization/settled', second)

    await expect(ctx.authorization.begin({ key: KEY, interaction: surface() }))
      .resolves.toEqual({ status: 'authorized', key: KEY })

    expect(second).toHaveBeenCalledWith(KEY, 'authorized')
  })

  it('contains an async listener rejection', async () => {
    const ctx = await harness()
    ctx.authorization.registerFlow(committingFlow(ctx))
    // An unknown-returning function keeps the typed surface legal while the
    // runtime value is still the rejected promise the containment must handle.
    const boom = (): unknown => Promise.reject(new Error('async watcher boom'))
    ctx.on('authorization/settled', boom)

    await expect(ctx.authorization.begin({ key: KEY, interaction: surface() }))
      .resolves.toEqual({ status: 'authorized', key: KEY })
    await new Promise(resolve => setTimeout(resolve, 10))
  })

})

it('rejects a commit attempted after local cancellation', async () => {
  const ctx = await harness()
  const ready = Promise.withResolvers<AuthorizationSession>()
  const finish = Promise.withResolvers<undefined>()
  ctx.authorization.registerFlow({
    key: KEY, label: 'Account', methods: [{ id: 'browser', label: 'Browser' }],
    run: (session) => { ready.resolve(session); return finish.promise },
  })
  const running = ctx.authorization.begin({ key: KEY, interaction: surface() })
  const session = await ready.promise
  ctx.authorization.cancel(KEY)
  try {
    await expect(running).resolves.toEqual({ status: 'cancelled', key: KEY })
    await expect(session.commit({ kind: 'grant', payload: { token: 'late' } })).rejects.toThrow()
    expect(await ctx.credentials.readRecord(KEY)).toBeUndefined()
  } finally { finish.resolve(undefined) }
})

it.each(['local', 'caller'] as const)('finishes an admitted commit during %s cancellation', async (source) => {
  const ctx = await harness()
  const admitted = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  const modify = ctx.credentials.modifyRecord.bind(ctx.credentials)
  const write = vi.spyOn(ctx.credentials, 'modifyRecord').mockImplementation(async (key, mutate) => {
    admitted.resolve(undefined)
    await release.promise
    return modify(key, mutate)
  })
  ctx.authorization.registerFlow({
    key: KEY, label: 'Account', methods: [{ id: 'browser', label: 'Browser' }],
    run: session => session.commit({ kind: 'grant', payload: { token: 'saved' } }),
  })
  const controller = new AbortController()
  const running = ctx.authorization.begin({ key: KEY, interaction: surface(), signal: controller.signal })
  try {
    await admitted.promise
    if (source === 'local') ctx.authorization.cancel(KEY)
    else controller.abort()
    release.resolve(undefined)
    await expect(running).resolves.toEqual({ status: 'authorized', key: KEY })
    expect(await ctx.credentials.readRecord(KEY)).toMatchObject({ payload: { token: 'saved' } })
  } finally { release.resolve(undefined); write.mockRestore() }
})

it('rejects a settled session commit before and during the next attempt', async () => {
  const ctx = await harness()
  const first = Promise.withResolvers<AuthorizationSession>()
  const second = Promise.withResolvers<AuthorizationSession>()
  const release = Promise.withResolvers<undefined>()
  let attempts = 0
  ctx.authorization.registerFlow({
    key: KEY, label: 'Account', methods: [{ id: 'browser', label: 'Browser' }],
    async run(session) {
      attempts += 1
      if (attempts === 1) first.resolve(session)
      else {
        second.resolve(session)
        await release.promise
      }
      await session.commit({ kind: 'grant', payload: { token: `grant-${String(attempts)}` } })
    },
  })
  await expect(ctx.authorization.begin({ key: KEY, interaction: surface() }))
    .resolves.toEqual({ status: 'authorized', key: KEY })
  const settled = await first.promise
  const late = { kind: 'grant' as const, payload: { token: 'late' } }
  await expect(settled.commit(late)).rejects.toMatchObject({ code: 'CANCELLED' })

  const running = ctx.authorization.begin({ key: KEY, interaction: surface() })
  try {
    await second.promise
    await expect(settled.commit(late)).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(await ctx.credentials.readRecord(KEY)).toMatchObject({ payload: { token: 'grant-1' } })
  } finally {
    release.resolve(undefined)
    await running
  }
  expect(await ctx.credentials.readRecord(KEY)).toMatchObject({ payload: { token: 'grant-2' } })
})
