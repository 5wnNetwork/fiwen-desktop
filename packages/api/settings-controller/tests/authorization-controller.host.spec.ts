import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AuthorizationService, {
  AuthorizationDeclinedError,
  type AuthorizationFlow,
  type AuthorizationSession,
} from '@deepseek-ai/dsh-authorization'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { remoteErrorOf, remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import AuthorizationController from '../src/authorization.ts'
import { MemoryCredentials } from '../../../credentials/authorization/tests/memory.ts'

const KEY = credentialKey('llm-pi-ai', 'openai-codex')
const OTHER = credentialKey('llm-pi-ai', 'anthropic')
const SIGNAL = new AbortController().signal

/** The thrown-or-rejected RemoteError from a call that may be synchronous. */
function remoteFailure(call: () => unknown): Promise<unknown> {
  return Promise.resolve().then(call).catch((error: unknown) => error)
}

async function boot(): Promise<{ ctx: Context; controller: AuthorizationController }> {
  const ctx = new Context()
  await ctx.plugin(MemoryCredentials)
  await ctx.plugin(AuthorizationService)
  await ctx.plugin(AuthorizationController)
  return { ctx, controller: ctx.authorizationController }
}

/** A flow that commits `key` through the record store, optionally after scripted behavior. */
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

describe('the authorization Remote namespace a settings surface calls', () => {
  it('publishes the authorization namespace from its own service key', async () => {
    const { controller } = await boot()
    const binding = controller.typertRemote
    expect(binding.serviceKey).toBe('authorizationController')
    expect(binding.namespace).toBe('authorization')
    expect(remoteMethods(controller)).toEqual([
      { method: 'list', invocation: { kind: 'direct' } },
      { method: 'describe', invocation: { kind: 'direct' } },
      { method: 'listAccounts', invocation: { kind: 'direct' } },
      { method: 'selectAccount', invocation: { kind: 'direct' } },
      { method: 'quota', invocation: { kind: 'direct' } },
      { method: 'begin', invocation: { kind: 'direct' } },
      { method: 'answer', invocation: { kind: 'direct' } },
      { method: 'decline', invocation: { kind: 'direct' } },
      { method: 'cancel', invocation: { kind: 'direct' } },
      { method: 'signOut', invocation: { kind: 'direct' } },
    ])
  })

  it('reports the actionable configuration error while no authorization service is mounted', async () => {
    const ctx = new Context()
    await ctx.plugin(MemoryCredentials)
    await ctx.plugin(AuthorizationController)
    for (const call of [
      () => ctx.authorizationController.list(),
      () => ctx.authorizationController.describe(String(KEY)),
      () => ctx.authorizationController.listAccounts(String(KEY)),
      () => ctx.authorizationController.selectAccount(String(KEY), 'acct-a'),
      () => ctx.authorizationController.quota(String(KEY), undefined, SIGNAL),
      () => ctx.authorizationController.begin(String(KEY), undefined, undefined, SIGNAL),
      () => { ctx.authorizationController.cancel(String(KEY)) },
    ]) {
      expect(remoteErrorOf(await remoteFailure(call))).toMatchObject({ code: 'gateway/internal', details: {} })
    }
  })

  it('reports the actionable configuration error while no credential provider is mounted', async () => {
    const ctx = new Context()
    await ctx.plugin(AuthorizationController)
    for (const call of [
      () => ctx.authorizationController.list(),
      () => ctx.authorizationController.signOut(String(KEY)),
    ]) {
      const failure = await call().catch((error: unknown) => error)
      expect(remoteErrorOf(failure)).toMatchObject({ code: 'gateway/internal', details: {} })
    }
  })

  it('lists registered flows with their stored-credential state', async () => {
    const { ctx, controller } = await boot()
    ctx.authorization.registerFlow(committingFlow(ctx))
    ctx.authorization.registerFlow(committingFlow(ctx, OTHER))
    await ctx.credentials.modifyRecord(OTHER, () =>
      Promise.resolve({ kind: 'grant', payload: { token: 'stored' } }))
    expect(await controller.list()).toEqual([
      {
        key: KEY, label: 'ChatGPT (Codex)',
        methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }, { id: 'api-key', label: 'Paste a key' }],
        inFlight: false, configured: false,
      },
      {
        key: OTHER, label: 'ChatGPT (Codex)',
        methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }, { id: 'api-key', label: 'Paste a key' }],
        inFlight: false, configured: true,
      },
    ])
  })

  it('describes a flow and keeps the stored state legible when the flow is gone', async () => {
    const { ctx, controller } = await boot()
    ctx.authorization.registerFlow(committingFlow(ctx))
    expect(await controller.describe(String(KEY))).toEqual({
      key: KEY,
      configured: false,
      entry: {
        key: KEY, label: 'ChatGPT (Codex)',
        methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }, { id: 'api-key', label: 'Paste a key' }],
        inFlight: false, configured: false,
      },
    })
    expect(await controller.describe(String(OTHER))).toEqual({ key: OTHER, configured: false })
    await ctx.credentials.modifyRecord(OTHER, () =>
      Promise.resolve({ kind: 'grant', payload: { token: 'stored' } }))
    expect(await controller.describe(String(OTHER))).toEqual({ key: OTHER, configured: true })
  })

  it('reports malformed keys and payloads as bad-request', async () => {
    const { controller } = await boot()
    for (const call of [
      () => controller.describe('not a key'),
      () => controller.begin('not a key', undefined, undefined, SIGNAL),
      () => controller.begin('', undefined, undefined, SIGNAL),
      () => controller.begin(String(KEY), 42 as unknown as string, undefined, SIGNAL),
      () => { controller.cancel('not a key') },
      () => controller.signOut('not a key'),
      () => controller.answer('', 'x'),
      () => controller.answer(`ap-${'x'.repeat(200)}`, 'x'),
      () => controller.answer('ap-1', 'x'.repeat(70 * 1024)),
      () => controller.decline(''),
    ]) {
      expect(remoteErrorOf(await remoteFailure(call))).toMatchObject({ code: 'gateway/bad-request' })
    }
  })

  it('relays notices and prompts as events and delivers answers to the waiting flow', async () => {
    const { ctx, controller } = await boot()
    const events: { notices: unknown[]; prompts: { key: unknown; promptId: string; prompt: unknown }[] } = {
      notices: [], prompts: [],
    }
    ctx.on('authorization/notice', (event) => { events.notices.push(event) })
    ctx.on('authorization/prompt', (event) => { events.prompts.push(event) })
    const asked = Promise.withResolvers<AuthorizationSession>()
    ctx.authorization.registerFlow(committingFlow(ctx, KEY, async (session) => {
      session.notify({ message: 'Open the link', url: 'https://auth.example/abc', code: 'CODE-123' })
      asked.resolve(session)
      const code = await session.prompt({ kind: 'text', message: 'Paste the code' })
      expect(code).toBe('the code')
    }))
    const attempt = controller.begin(String(KEY), undefined, undefined, SIGNAL)
    const session = await asked.promise
    expect(session.method).toBe('oauth')
    expect(events.notices).toEqual([{ key: KEY, notice: { message: 'Open the link', url: 'https://auth.example/abc', code: 'CODE-123' } }])
    const promptEvent = events.prompts[0]!
    expect(promptEvent.key).toBe(KEY)
    expect(promptEvent.prompt).toEqual({ kind: 'text', message: 'Paste the code' })
    expect(JSON.stringify(promptEvent)).not.toContain('signal')
    expect(controller.answer(promptEvent.promptId, 'the code')).toBe(true)
    expect(await attempt).toEqual({ status: 'authorized', key: KEY })
    // A prompt id never outlives its answer.
    expect(controller.answer(promptEvent.promptId, 'late')).toBe(false)
  })

  it('runs the named method instead of the flow default', async () => {
    const { ctx, controller } = await boot()
    const asked = Promise.withResolvers<string>()
    ctx.authorization.registerFlow(committingFlow(ctx, KEY, (session) => {
      asked.resolve(session.method)
      return Promise.resolve()
    }))
    const attempt = controller.begin(String(KEY), 'api-key', undefined, SIGNAL)
    expect(await asked.promise).toBe('api-key')
    expect(await attempt).toEqual({ status: 'authorized', key: KEY })
  })

  it('reports an unclaimed key, an unknown method, and a busy key as authorization/rejected', async () => {
    const { ctx, controller } = await boot()
    const noFlow = await controller.begin(String(KEY), undefined, undefined, SIGNAL).catch((error: unknown) => error)
    expect(remoteErrorOf(noFlow)).toMatchObject({
      code: 'authorization/rejected', details: { key: String(KEY) },
    })
    ctx.authorization.registerFlow(committingFlow(ctx, KEY, () => new Promise(() => {})))
    const unknownMethod = await controller.begin(String(KEY), 'mystery', undefined, SIGNAL).catch((error: unknown) => error)
    expect(remoteErrorOf(unknownMethod)).toMatchObject({ code: 'authorization/rejected' })
    const parked = controller.begin(String(KEY), undefined, undefined, SIGNAL)
    const busy = await controller.begin(String(KEY), undefined, undefined, SIGNAL).catch((error: unknown) => error)
    expect(remoteErrorOf(busy)).toMatchObject({
      code: 'authorization/rejected', details: { key: String(KEY) },
    })
    controller.cancel(String(KEY))
    expect(await parked).toEqual({ status: 'cancelled', key: KEY })
  })

  it('reports a flow failure as authorization/rejected naming only the key', async () => {
    const { ctx, controller } = await boot()
    ctx.authorization.registerFlow({
      key: KEY,
      label: 'ChatGPT (Codex)',
      methods: [{ id: 'oauth', label: 'Sign in' }],
      run: () => Promise.reject(new Error('the provider timed out')),
    })
    const failure = await controller.begin(String(KEY), undefined, undefined, SIGNAL).catch((error: unknown) => error)
    const { code, message, details } = remoteErrorOf(failure) ?? {}
    expect(code).toBe('authorization/rejected')
    expect(message).toBe('the provider timed out')
    expect(details).toEqual({ key: String(KEY) })
  })

  it('turns a declined prompt into a cancelled attempt, not a failure', async () => {
    const { ctx, controller } = await boot()
    const prompts: { key: unknown; promptId: string }[] = []
    ctx.on('authorization/prompt', (event) => { prompts.push(event) })
    ctx.authorization.registerFlow(committingFlow(ctx, KEY, session =>
      session.prompt({ kind: 'select', message: 'Pick', options: [{ id: 'a', label: 'A' }] }).then(() => {})))
    const attempt = controller.begin(String(KEY), undefined, undefined, SIGNAL)
    await vi.waitFor(() => { expect(prompts).toHaveLength(1) })
    expect(controller.decline('ap-unknown')).toBe(false)
    expect(controller.decline(prompts[0]!.promptId)).toBe(true)
    expect(await attempt).toEqual({ status: 'cancelled', key: KEY })
  })

  it('emits prompt-withdrawn when a flow retires its own question and refuses the stale id', async () => {
    const { ctx, controller } = await boot()
    const withdrawn: unknown[] = []
    ctx.on('authorization/prompt-withdrawn', (event) => { withdrawn.push(event) })
    const prompts: { promptId: string }[] = []
    ctx.on('authorization/prompt', (event) => { prompts.push(event) })
    const promptController = new AbortController()
    ctx.authorization.registerFlow(committingFlow(ctx, KEY, async (session) => {
      const racing = session.prompt({ kind: 'text', message: 'Manual?', signal: promptController.signal })
      promptController.abort()
      await racing.catch((error: unknown) => {
        expect((error as Error).name).toBe('AuthorizationError')
      })
    }))
    const attempt = controller.begin(String(KEY), undefined, undefined, SIGNAL)
    await vi.waitFor(() => { expect(withdrawn).toHaveLength(1) })
    expect(withdrawn[0]).toEqual({ key: KEY, promptId: prompts[0]!.promptId })
    expect(controller.answer(prompts[0]!.promptId, 'late')).toBe(false)
    expect(await attempt).toEqual({ status: 'authorized', key: KEY })
  })

  it('settles a parked prompt when its attempt ends without answering it', async () => {
    const { ctx, controller } = await boot()
    const prompts: { promptId: string }[] = []
    ctx.on('authorization/prompt', (event) => { prompts.push(event) })
    const withdrawal = new AbortController()
    const declined: unknown[] = []
    ctx.authorization.registerFlow(committingFlow(ctx, KEY, async (session) => {
      await session.prompt({ kind: 'text', message: 'Never answered' }).catch((error: unknown) => {
        declined.push(error)
        // The prompt refused while the attempt was already gone: do not commit.
        throw error
      })
    }))
    const attempt = controller.begin(String(KEY), undefined, undefined, withdrawal.signal)
    await vi.waitFor(() => { expect(prompts).toHaveLength(1) })
    withdrawal.abort()
    expect(await attempt).toEqual({ status: 'cancelled', key: KEY })
    expect(controller.answer(prompts[0]!.promptId, 'too late')).toBe(false)
    await vi.waitFor(() => { expect(declined).toHaveLength(1) })
    expect((declined[0] as AuthorizationDeclinedError).name).toBe('AuthorizationError')
  })

  it('withdraws a running attempt through cancel', async () => {
    const { ctx, controller } = await boot()
    const started = Promise.withResolvers<undefined>()
    ctx.authorization.registerFlow(committingFlow(ctx, KEY, (session) => {
      started.resolve(undefined)
      return new Promise((_resolve, reject) => {
        session.signal.addEventListener('abort', () => { reject(new Error('attempt withdrawn')) }, { once: true })
      })
    }))
    const attempt = controller.begin(String(KEY), undefined, undefined, SIGNAL)
    await started.promise
    controller.cancel(String(KEY))
    expect(await attempt).toEqual({ status: 'cancelled', key: KEY })
  })

  it('removes a stored record on sign-out and reports a refusal naming only the key', async () => {
    const { ctx, controller } = await boot()
    await ctx.credentials.modifyRecord(KEY, () =>
      Promise.resolve({ kind: 'grant', payload: { token: 'stored' } }))
    await controller.signOut(String(KEY))
    expect((await ctx.credentials.describeRecord(KEY)).configured).toBe(false)
    const removing = vi.spyOn(ctx.credentials, 'deleteRecord').mockRejectedValueOnce(new Error('storage failed'))
    const failure = await controller.signOut(String(KEY)).catch((error: unknown) => error)
    expect(remoteErrorOf(failure)).toMatchObject({
      code: 'authorization/rejected', details: { key: String(KEY) },
    })
    expect(remoteErrorOf(failure)?.message).toBe('storage failed')
    removing.mockRestore()
  })

  it('carries the account slot through begin to the session and the outcome', async () => {
    const { ctx, controller } = await boot()
    const asked = Promise.withResolvers<string | undefined>()
    ctx.authorization.registerFlow(committingFlow(ctx, KEY, async (session) => {
      asked.resolve(session.account)
      await ctx.credentials.modifyRecord(
        credentialKey('llm-pi-ai', `openai-codex--${session.account ?? ''}`),
        () => Promise.resolve({ kind: 'grant', payload: { token: 'slotted' } }),
      )
    }))

    await expect(controller.begin(String(KEY), undefined, 'acct-a', SIGNAL))
      .resolves.toEqual({ status: 'authorized', key: credentialKey('llm-pi-ai', 'openai-codex--acct-a') })
    expect(await asked.promise).toBe('acct-a')
  })

  it('lists, selects, and probes accounts through their own methods', async () => {
    const { ctx, controller } = await boot()
    ctx.authorization.registerFlow({
      key: KEY,
      label: 'ChatGPT (Codex)',
      methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }],
      run: () => Promise.resolve(),
      describeRecord: record => record.kind === 'grant' ? { label: 'whoever' } : {},
      quota: () => Promise.resolve({ windows: [{ id: 'five-hour', label: '5h', usedPercent: 10 }], fetchedAt: 7 }),
    })
    await ctx.credentials.modifyRecord(credentialKey('llm-pi-ai', 'openai-codex--acct-a'), () =>
      Promise.resolve({ kind: 'grant', payload: { token: 'a' } }))

    await expect(controller.listAccounts(String(KEY))).resolves.toEqual([
      { key: credentialKey('llm-pi-ai', 'openai-codex--acct-a'), account: 'acct-a', label: 'whoever', selected: true },
    ])
    await expect(controller.selectAccount(String(KEY), 'acct-a')).resolves.toBeUndefined()
    await expect(controller.quota(String(KEY), 'acct-a', SIGNAL)).resolves.toEqual({
      windows: [{ id: 'five-hour', label: '5h', usedPercent: 10 }],
      fetchedAt: 7,
    })
    await expect(controller.quota(String(OTHER), undefined, SIGNAL)).rejects.toMatchObject({
      code: 'authorization/rejected',
    })
    await expect(controller.selectAccount(String(KEY), 'acct-missing')).rejects.toMatchObject({
      code: 'authorization/rejected',
    })
    await expect(controller.listAccounts(String(OTHER))).rejects.toMatchObject({
      code: 'authorization/rejected',
    })
  })

  it('ignores a prompt signal that fires after its attempt already settled', async () => {
    const { ctx, controller } = await boot()
    const prompts: { promptId: string }[] = []
    const withdrawn: unknown[] = []
    ctx.on('authorization/prompt', (event) => { prompts.push(event) })
    ctx.on('authorization/prompt-withdrawn', (event) => { withdrawn.push(event) })
    const flowDeadline = new AbortController()
    ctx.authorization.registerFlow(committingFlow(ctx, KEY, session =>
      session.prompt({ kind: 'text', message: 'Parked', signal: flowDeadline.signal }).then(() => {})))
    const withdrawal = new AbortController()
    const attempt = controller.begin(String(KEY), undefined, undefined, withdrawal.signal)
    await vi.waitFor(() => { expect(prompts).toHaveLength(1) })
    withdrawal.abort()
    await expect(attempt).resolves.toEqual({ status: 'cancelled', key: KEY })
    // The attempt's settlement already cleared the prompt; the late signal
    // finds nothing to withdraw and must not emit or throw.
    flowDeadline.abort()
    expect(withdrawn).toHaveLength(0)
  })

  it('never publishes a prompt whose signal is already aborted', async () => {
    const { ctx, controller } = await boot()
    const events: unknown[] = []
    ctx.on('authorization/prompt', (event) => { events.push(event) })
    const withdrawn: unknown[] = []
    ctx.on('authorization/prompt-withdrawn', (event) => { withdrawn.push(event) })
    const preAborted = new AbortController()
    preAborted.abort()
    ctx.authorization.registerFlow(committingFlow(ctx, KEY, async (session) => {
      await session.prompt({ kind: 'text', message: 'Already gone', signal: preAborted.signal }).catch(() => {})
    }))
    await expect(controller.begin(String(KEY), undefined, undefined, SIGNAL))
      .resolves.toEqual({ status: 'authorized', key: KEY })
    expect(events).toHaveLength(0)
    expect(withdrawn).toHaveLength(1)
  })

  it('settles only its own key\'s prompts when an attempt ends', async () => {
    const { ctx, controller } = await boot()
    const prompts: { key: unknown; promptId: string }[] = []
    ctx.on('authorization/prompt', (event) => { prompts.push(event) })
    // A prompt parked under a second flow's key must survive another
    // attempt's settlement.
    ctx.authorization.registerFlow({
      ...committingFlow(ctx, OTHER),
      run: async (session) => {
        await session.prompt({ kind: 'text', message: 'Parked' }).catch(() => {})
        await ctx.credentials.modifyRecord(OTHER, () => Promise.resolve({ kind: 'grant', payload: {} }))
      },
    })
    ctx.authorization.registerFlow(committingFlow(ctx, KEY, session =>
      session.prompt({ kind: 'text', message: 'Will decline' }).then(() => {})))
    const other = controller.begin(String(OTHER), undefined, undefined, SIGNAL)
    const attempt = controller.begin(String(KEY), undefined, undefined, SIGNAL)
    await vi.waitFor(() => { expect(prompts).toHaveLength(2) })
    const parked = prompts.find(prompt => prompt.key === OTHER)!
    const own = prompts.find(prompt => prompt.key === KEY)!
    controller.decline(own.promptId)
    expect(await attempt).toEqual({ status: 'cancelled', key: KEY })
    // The parked prompt is still live and still answerable.
    expect(controller.answer(parked.promptId, 'late answer')).toBe(true)
    await expect(other).resolves.toEqual({ status: 'authorized', key: OTHER })
  })

  it('reports a non-Error refusal by its string form', async () => {
    const { ctx, controller } = await boot()
    await ctx.credentials.modifyRecord(KEY, () =>
      Promise.resolve({ kind: 'grant', payload: { token: 'stored' } }))
    const removing = vi.spyOn(ctx.credentials, 'deleteRecord').mockRejectedValueOnce('plain refusal')
    const failure = await controller.signOut(String(KEY)).catch((error: unknown) => error)
    expect(remoteErrorOf(failure)).toMatchObject({ code: 'authorization/rejected', details: { key: String(KEY) } })
    expect(remoteErrorOf(failure)?.message).toBe('plain refusal')
    removing.mockRestore()
  })
})
