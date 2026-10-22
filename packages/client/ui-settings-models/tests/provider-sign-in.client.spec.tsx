// @vitest-environment jsdom
/** Provider-card sign-in surface: OAuth begin, notice/prompt relay, cancel, and sign-out. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import type {
  AuthorizationAccountView, AuthorizationEntryView, AuthorizationNotice, AuthorizationPromptView, AuthorizationQuota,
  RemoteResult,
} from '@deepseek-ai/dsh-api-remotes/client'
import { ProviderSignIn } from '../src/client/ProviderSignIn.tsx'
import { createModelsOperations } from '../src/client/operations.ts'
import type { ModelsOperations } from '../src/client/operations.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const t = (key: keyof typeof en): string => en[key]

const OAUTH_ENTRY: AuthorizationEntryView = {
  key: 'llm-pi-ai/anthropic' as AuthorizationEntryView['key'],
  label: 'Claude Pro/Max',
  methods: [
    { id: 'oauth', label: 'Sign in with Claude' },
    { id: 'api-key', label: 'API key' },
  ],
  inFlight: false,
  configured: false,
}

/** A scripted remote.authorization namespace plus the event listeners my operations registered. */
function harness(overrides: {
  begin?: () => Promise<RemoteResult<{ status: 'authorized' | 'cancelled' }>>
  signOut?: () => Promise<RemoteResult<void>>
  selectAccount?: () => Promise<RemoteResult<void>>
  quota?: () => Promise<RemoteResult<AuthorizationQuota | undefined>>
} = {}) {
  const listeners = new Map<string, (event: never) => void>()
  const face = {
    authorization: {
      list: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
      begin: vi.fn(overrides.begin ?? (() => Promise.resolve({ ok: true as const, value: { status: 'authorized' as const } }))),
      answer: vi.fn(() => Promise.resolve({ ok: true as const, value: true })),
      decline: vi.fn(() => Promise.resolve({ ok: true as const, value: true })),
      cancel: vi.fn(() => Promise.resolve({ ok: true as const, value: undefined })),
      signOut: vi.fn(overrides.signOut ?? (() => Promise.resolve({ ok: true as const, value: undefined }))),
      listAccounts: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
      selectAccount: vi.fn(overrides.selectAccount ?? (() => Promise.resolve({ ok: true as const, value: undefined }))),
      quota: vi.fn(overrides.quota ?? (() => Promise.resolve({ ok: true as const, value: undefined }))),
    },
    $on: vi.fn((event: string, listener: (event: never) => void) => {
      listeners.set(event, listener)
      return vi.fn()
    }),
  }
  const ctx = Object.assign(new Context(), { remote: face })
  const operations = createModelsOperations(ctx)
  return { face, operations, listeners }
}

/** A stub browser tab the way BrowserLogin drives one. */
function stubTab() {
  const tab = { closed: false, opener: null, close: vi.fn(() => { tab.closed = true }), location: { replace: vi.fn() } }
  const open = vi.fn(() => tab)
  vi.stubGlobal('open', open)
  return { tab, open }
}

function renderSignIn(
  operations: ModelsOperations,
  entry: AuthorizationEntryView = OAUTH_ENTRY,
): ReturnType<typeof render> {
  return render(<ProviderSignIn entry={entry} operations={operations} t={t} disabled={false} />)
}

describe('ProviderSignIn', () => {
  it('offers no surface when the flow has no OAuth method', () => {
    const { operations } = harness()
    renderSignIn(operations, { ...OAUTH_ENTRY, methods: [{ id: 'api-key', label: 'API key' }] })
    expect(screen.queryByText(en.subscription)).toBeNull()
  })

  it('begins the attempt on click and reports the authorized settlement', async () => {
    const { face, operations } = harness()
    stubTab()
    renderSignIn(operations)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Claude' }))
    await waitFor(() => { expect(face.authorization.begin).toHaveBeenCalledWith('llm-pi-ai/anthropic', 'oauth', undefined) })
    await waitFor(() => { expect(screen.queryByText(en.subscription)).toBeTruthy() })
  })

  it('navigates the preopened tab when the flow reports its sign-in URL', async () => {
    const begin = Promise.withResolvers<RemoteResult<{ status: 'authorized' | 'cancelled' }>>()
    const { face, operations, listeners } = harness({ begin: () => begin.promise })
    const { tab, open } = stubTab()
    renderSignIn(operations)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Claude' }))
    expect(open).toHaveBeenCalledWith('about:blank', '_blank')
    const notice = listeners.get('authorization/notice')
    expect(notice).toBeTypeOf('function')
    act(() => {
      notice!({ key: 'llm-pi-ai/anthropic', notice: { message: 'Continue in your browser', url: 'https://claude.example/auth' } } as never)
    })
    expect(tab.location.replace).toHaveBeenCalledWith('https://claude.example/auth')
    expect(screen.getByText('Continue in your browser')).toBeTruthy()
    await act(async () => { begin.resolve({ ok: true, value: { status: 'authorized' } }); await begin.promise })
    expect(face.authorization.cancel).not.toHaveBeenCalled()
  })

  it('relays a waiting prompt to the form and answers it', async () => {
    const begin = Promise.withResolvers<RemoteResult<{ status: 'authorized' | 'cancelled' }>>()
    const { face, operations, listeners } = harness({ begin: () => begin.promise })
    stubTab()
    renderSignIn(operations)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Claude' }))
    const prompt: AuthorizationPromptView = { kind: 'text', message: 'Paste the code', placeholder: 'code' }
    act(() => {
      listeners.get('authorization/prompt')!({ key: 'llm-pi-ai/anthropic', promptId: 'ap-1', prompt } as never)
    })
    fireEvent.change(screen.getByLabelText('Paste the code'), { target: { value: 'abc123' } })
    fireEvent.click(screen.getByRole('button', { name: en.signInContinue }))
    expect(face.authorization.answer).toHaveBeenCalledWith('ap-1', 'abc123')
    await act(async () => { begin.resolve({ ok: true, value: { status: 'authorized' } }); await begin.promise })
  })

  it('answers a select prompt from the chosen option', async () => {
    const begin = Promise.withResolvers<RemoteResult<{ status: 'authorized' | 'cancelled' }>>()
    const { face, operations, listeners } = harness({ begin: () => begin.promise })
    stubTab()
    renderSignIn(operations)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Claude' }))
    const prompt: AuthorizationPromptView = {
      kind: 'select', message: 'Pick an account',
      options: [{ id: 'work', label: 'Work' }, { id: 'personal', label: 'Personal' }],
    }
    act(() => {
      listeners.get('authorization/prompt')!({ key: 'llm-pi-ai/anthropic', promptId: 'ap-2', prompt } as never)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Personal' }))
    expect(face.authorization.answer).toHaveBeenCalledWith('ap-2', 'personal')
    await act(async () => { begin.resolve({ ok: true, value: { status: 'authorized' } }); await begin.promise })
  })

  it('masks a secret prompt and declines it from its own dismiss', async () => {
    const begin = Promise.withResolvers<RemoteResult<{ status: 'authorized' | 'cancelled' }>>()
    const { face, operations, listeners } = harness({ begin: () => begin.promise })
    stubTab()
    renderSignIn(operations)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Claude' }))
    const prompt: AuthorizationPromptView = { kind: 'secret', message: 'Paste the token' }
    act(() => {
      listeners.get('authorization/prompt')!({ key: 'llm-pi-ai/anthropic', promptId: 'ap-3', prompt } as never)
    })
    expect(screen.getByLabelText('Paste the token').getAttribute('type')).toBe('password')
    fireEvent.click(screen.getAllByRole('button', { name: en.cancel })[0]!)
    expect(face.authorization.decline).toHaveBeenCalledWith('ap-3')
    await act(async () => { begin.resolve({ ok: true, value: { status: 'cancelled' } }); await begin.promise })
  })

  it('dismisses a rendered prompt the flow itself withdrew', async () => {
    const begin = Promise.withResolvers<RemoteResult<{ status: 'authorized' | 'cancelled' }>>()
    const { operations, listeners } = harness({ begin: () => begin.promise })
    stubTab()
    renderSignIn(operations)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Claude' }))
    act(() => {
      listeners.get('authorization/prompt')!({
        key: 'llm-pi-ai/anthropic', promptId: 'ap-4', prompt: { kind: 'text', message: 'Manual code?' },
      } as never)
    })
    expect(screen.getByLabelText('Manual code?')).toBeTruthy()
    act(() => {
      listeners.get('authorization/prompt-withdrawn')!({ key: 'llm-pi-ai/anthropic', promptId: 'ap-4' } as never)
    })
    expect(screen.queryByLabelText('Manual code?')).toBeNull()
    await act(async () => { begin.resolve({ ok: true, value: { status: 'authorized' } }); await begin.promise })
  })

  it('opens the URL itself when the preopened tab is already gone', async () => {
    const begin = Promise.withResolvers<RemoteResult<{ status: 'authorized' | 'cancelled' }>>()
    const { operations, listeners } = harness({ begin: () => begin.promise })
    const { tab, open } = stubTab()
    tab.closed = true
    renderSignIn(operations)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Claude' }))
    act(() => {
      listeners.get('authorization/notice')!({
        key: 'llm-pi-ai/anthropic', notice: { message: 'Continue', url: 'https://claude.example/auth' },
      } as never)
    })
    expect(open).toHaveBeenCalledWith('https://claude.example/auth', '_blank', 'noopener')
    await act(async () => { begin.resolve({ ok: true, value: { status: 'authorized' } }); await begin.promise })
  })

  it('closes a tab that never navigated when the attempt settles', async () => {
    const { operations } = harness()
    const { tab } = stubTab()
    renderSignIn(operations)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Claude' }))
    await waitFor(() => { expect(tab.close).toHaveBeenCalled() })
  })

  it('keeps an event with no attempt from reaching handlers that do not own it', async () => {
    const { listeners } = harness()
    // Emitted before any begin: the notice belongs to an attempt this surface
    // did not start, and silently dropping it is the contract.
    expect(() => {
      listeners.get('authorization/notice')!({ key: 'llm-pi-ai/anthropic', notice: { message: 'stray' } } as never)
      listeners.get('authorization/prompt')!({
        key: 'llm-pi-ai/anthropic', promptId: 'ap-x', prompt: { kind: 'text', message: 'stray' },
      } as never)
      listeners.get('authorization/prompt-withdrawn')!({ key: 'llm-pi-ai/anthropic', promptId: 'ap-x' } as never)
    }).not.toThrow()
  })

  it('reports attempt lifetime through onBusyChange', async () => {
    const begin = Promise.withResolvers<RemoteResult<{ status: 'authorized' | 'cancelled' }>>()
    const { operations } = harness({ begin: () => begin.promise })
    stubTab()
    const busy = vi.fn()
    render(<ProviderSignIn entry={OAUTH_ENTRY} operations={operations} t={t} disabled={false} onBusyChange={busy} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Claude' }))
    expect(busy).toHaveBeenLastCalledWith(true)
    await act(async () => { begin.resolve({ ok: true, value: { status: 'authorized' } }); await begin.promise })
    expect(busy).toHaveBeenLastCalledWith(false)
  })

  it('withdraws the attempt from its Cancel control', async () => {
    const begin = Promise.withResolvers<RemoteResult<{ status: 'authorized' | 'cancelled' }>>()
    const { face, operations } = harness({ begin: () => begin.promise })
    stubTab()
    renderSignIn(operations)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Claude' }))
    fireEvent.click(screen.getByRole('button', { name: en.cancel }))
    expect(face.authorization.cancel).toHaveBeenCalledWith('llm-pi-ai/anthropic')
    await act(async () => { begin.resolve({ ok: true, value: { status: 'cancelled' } }); await begin.promise })
  })

  it('cancels its own attempt when the card unmounts', async () => {
    const begin = Promise.withResolvers<RemoteResult<{ status: 'authorized' | 'cancelled' }>>()
    const { face, operations } = harness({ begin: () => begin.promise })
    stubTab()
    const view = renderSignIn(operations)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Claude' }))
    view.unmount()
    expect(face.authorization.cancel).toHaveBeenCalledWith('llm-pi-ai/anthropic')
    await act(async () => { begin.resolve({ ok: true, value: { status: 'cancelled' } }); await begin.promise })
  })

  it('renders the flow failure after a rejected begin', async () => {
    const { operations } = harness({
      begin: () => Promise.resolve({
        ok: false,
        error: new RemoteError('authorization/rejected', 'flow broke', { key: 'llm-pi-ai/anthropic' }),
      }),
    })
    stubTab()
    renderSignIn(operations)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Claude' }))
    await screen.findByText('flow broke')
  })

  it('reports a transport-level begin rejection as a failure', async () => {
    const { operations } = harness({ begin: () => Promise.reject(new Error('connection lost')) })
    stubTab()
    renderSignIn(operations)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Claude' }))
    await screen.findByText('connection lost')
  })

  it('signs out through the namespace and reports a refusal', async () => {
    const { face, operations } = harness({
      signOut: () => Promise.resolve({
        ok: false,
        error: new RemoteError('authorization/rejected', 'store refused', { key: 'llm-pi-ai/anthropic' }),
      }),
    })
    stubTab()
    renderSignIn(operations, { ...OAUTH_ENTRY, configured: true })
    fireEvent.click(screen.getByRole('button', { name: en.signOut }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: en.signOut }))
    await waitFor(() => { expect(face.authorization.signOut).toHaveBeenCalledWith('llm-pi-ai/anthropic') })
    await screen.findByText('store refused')
  })

  it('keeps the attempt hidden while another surface runs it', () => {
    const { operations } = harness()
    renderSignIn(operations, { ...OAUTH_ENTRY, inFlight: true })
    expect(screen.getByText(en.signingIn)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sign in with Claude' })).toBeNull()
  })

  it('disables its actions while the card owns a write', () => {
    const { operations } = harness()
    stubTab()
    render(<ProviderSignIn entry={{ ...OAUTH_ENTRY, configured: true }} operations={operations} t={t} disabled />)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign in with Claude' }).disabled).toBe(true)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: en.signOut }).disabled).toBe(true)
  })

  it('renders a non-Error transport rejection by its string form', async () => {
    const { face, operations } = harness()
    face.authorization.begin.mockRejectedValueOnce('socket closed')
    stubTab()
    renderSignIn(operations)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Claude' }))
    await screen.findByText('socket closed')
  })

  it('runs the attempt when the browser refuses a preopened tab', async () => {
    const { face, operations } = harness()
    vi.stubGlobal('open', vi.fn(() => null))
    renderSignIn(operations)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Claude' }))
    await waitFor(() => { expect(face.authorization.begin).toHaveBeenCalled() })
    await waitFor(() => { expect(screen.queryByText(en.subscription)).toBeTruthy() })
  })

  it('logs every notice but navigates only to the first URL', async () => {
    const begin = Promise.withResolvers<RemoteResult<{ status: 'authorized' | 'cancelled' }>>()
    const { operations, listeners } = harness({ begin: () => begin.promise })
    const { tab, open } = stubTab()
    renderSignIn(operations)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Claude' }))
    act(() => {
      listeners.get('authorization/notice')!({ key: 'llm-pi-ai/anthropic', notice: { message: 'Waiting on the provider' } } as never)
      listeners.get('authorization/notice')!({
        key: 'llm-pi-ai/anthropic', notice: { message: 'Open the link', url: 'https://claude.example/auth' },
      } as never)
      listeners.get('authorization/notice')!({
        key: 'llm-pi-ai/anthropic', notice: { message: 'Redirected again', url: 'https://claude.example/second' },
      } as never)
    })
    expect(open).toHaveBeenCalledTimes(1)
    expect(tab.location.replace).toHaveBeenCalledTimes(1)
    expect(tab.location.replace).toHaveBeenCalledWith('https://claude.example/auth')
    expect(screen.getByText('Waiting on the provider')).toBeTruthy()
    expect(screen.getByText('Redirected again')).toBeTruthy()
    await act(async () => { begin.resolve({ ok: true, value: { status: 'authorized' } }); await begin.promise })
  })

  it('ignores a withdrawal that names no live prompt', async () => {
    const begin = Promise.withResolvers<RemoteResult<{ status: 'authorized' | 'cancelled' }>>()
    const { operations, listeners } = harness({ begin: () => begin.promise })
    stubTab()
    renderSignIn(operations)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Claude' }))
    act(() => {
      listeners.get('authorization/prompt')!({
        key: 'llm-pi-ai/anthropic', promptId: 'ap-live', prompt: { kind: 'text', message: 'Still waiting' },
      } as never)
      listeners.get('authorization/prompt-withdrawn')!({ key: 'llm-pi-ai/anthropic', promptId: 'ap-stale' } as never)
    })
    expect(screen.getByLabelText('Still waiting')).toBeTruthy()
    await act(async () => { begin.resolve({ ok: true, value: { status: 'authorized' } }); await begin.promise })
  })

  it('shows the device code and a retryable open-page control', async () => {
    const begin = Promise.withResolvers<RemoteResult<{ status: 'authorized' | 'cancelled' }>>()
    const { operations, listeners } = harness({ begin: () => begin.promise })
    const { open } = stubTab()
    renderSignIn(operations)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Claude' }))
    const notice: AuthorizationNotice = { message: 'Enter this code', url: 'https://device.example', code: 'ABCD-1234' }
    act(() => {
      listeners.get('authorization/notice')!({ key: 'llm-pi-ai/anthropic', notice } as never)
    })
    expect(screen.getByText('ABCD-1234')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.signInOpen }))
    expect(open.mock.calls.at(-1)).toEqual(['https://device.example', '_blank', 'noopener'])
    await act(async () => { begin.resolve({ ok: true, value: { status: 'authorized' } }); await begin.promise })
  })
})

describe('ProviderSignIn accounts', () => {
  const ACCOUNTS: AuthorizationAccountView[] = [
    { key: 'llm-pi-ai/anthropic--acct-aa' as AuthorizationAccountView['key'], account: 'acct-aa', label: 'work@example.com', selected: true },
    { key: 'llm-pi-ai/anthropic--acct-bb' as AuthorizationAccountView['key'], account: 'acct-bb', selected: false },
    { key: 'llm-pi-ai/anthropic' as AuthorizationAccountView['key'], account: '', selected: false },
  ]

  function renderWithAccounts(operations: ModelsOperations, accounts = ACCOUNTS): void {
    render(<ProviderSignIn
      entry={{ ...OAUTH_ENTRY, configured: true }}
      accounts={accounts} operations={operations} t={t} disabled={false}
    />)
  }

  /** The disclosure header: the only expanded-capable button carrying the selected account's name. */
  function header(expanded = false): HTMLElement {
    // The name is a substring match: status markers inside the header (the
    // expired-credential chip) join its accessible name.
    return screen.getByRole('button', { name: /work@example\.com/, expanded })
  }

  it('names the selected account collapsed and lists every account expanded', async () => {
    const { face, operations } = harness()
    renderWithAccounts(operations)
    expect(header()).toBeTruthy()
    fireEvent.click(header())
    expect(screen.getByText('acct-bb')).toBeTruthy()
    expect(screen.getByText(en.accountBase)).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    // Expanding is the gesture that fetches every account's quota once.
    await waitFor(() => { expect(face.authorization.quota).toHaveBeenCalledTimes(3) })
    // Re-expanding reads the cache instead of probing again.
    fireEvent.click(header(true))
    fireEvent.click(header())
    await waitFor(() => { expect(screen.getAllByRole('radio')).toHaveLength(3) })
    expect(face.authorization.quota).toHaveBeenCalledTimes(3)
  })

  it('hides the list again from the same control', () => {
    const { operations } = harness()
    renderWithAccounts(operations)
    fireEvent.click(header())
    fireEvent.click(header(true))
    expect(screen.queryByText('acct-bb')).toBeNull()
  })

  it('selects another account through the remote', async () => {
    const { face, operations } = harness()
    renderWithAccounts(operations)
    fireEvent.click(header())
    fireEvent.click(screen.getAllByRole('radio')[1]!)
    await waitFor(() => { expect(face.authorization.selectAccount).toHaveBeenCalledWith('llm-pi-ai/anthropic', 'acct-bb') })
  })

  it('does not reselect the account that is already active', async () => {
    const { face, operations } = harness()
    renderWithAccounts(operations)
    fireEvent.click(header())
    const radios = screen.getAllByRole('radio')
    expect(radios[0]!.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(radios[0]!)
    await waitFor(() => { expect(face.authorization.quota).toHaveBeenCalled() })
    expect(face.authorization.selectAccount).not.toHaveBeenCalled()
  })

  it('flags an account whose stored credential has expired, collapsed and in its row', async () => {
    const { operations } = harness()
    renderWithAccounts(operations, [
      {
        key: 'llm-pi-ai/anthropic--acct-aa' as AuthorizationAccountView['key'],
        account: 'acct-aa', label: 'work@example.com', selected: true,
        expiresAt: Date.now() - 1_000,
      },
      {
        key: 'llm-pi-ai/anthropic--acct-bb' as AuthorizationAccountView['key'],
        account: 'acct-bb', selected: false,
        expiresAt: Date.now() + 3_600_000,
      },
    ])

    // The selected account's stale credential is flagged on the collapsed header.
    expect(within(header()).getByText(en.accountExpired)).toBeTruthy()

    fireEvent.click(header())
    const radios = screen.getAllByRole('radio')
    expect(within(radios[0]!).getByText(en.accountExpired)).toBeTruthy()
    // A live token's expiry is not noise the row carries.
    expect(within(radios[1]!).queryByText(en.accountExpired)).toBeNull()
  })

  it('surfaces a select refusal', async () => {
    const { operations } = harness({
      selectAccount: () => Promise.resolve({
        ok: false,
        error: new RemoteError('authorization/rejected', 'pick refused', { key: 'llm-pi-ai/anthropic' }),
      }),
    })
    renderWithAccounts(operations)
    fireEvent.click(header())
    fireEvent.click(screen.getAllByRole('radio')[1]!)
    await screen.findByText('pick refused')
  })

  it('reports each account\'s quota beside its row once expanded', async () => {
    const { operations } = harness({
      quota: () => Promise.resolve({
        ok: true,
        value: {
          plan: 'pro',
          windows: [
            { id: 'five-hour', label: '5 hour', usedPercent: 42.4, resetAt: 1_800_000_000_000 },
            { id: 'seven-day', label: '7 day', usedPercent: 8 },
          ],
          fetchedAt: 1_700_000_000_000,
        },
      }),
    })
    renderWithAccounts(operations)
    fireEvent.click(header())
    const rows = screen.getAllByRole('radio')
    await screen.findAllByText('pro')
    for (const row of rows) {
      expect(within(row).getByText('5 hour 42%')).toBeTruthy()
      expect(within(row).getByText('7 day 8%')).toBeTruthy()
    }
  })

  it('renders quota windows that carry no plan or reset time', async () => {
    const { operations } = harness({
      quota: () => Promise.resolve({
        ok: true,
        value: { windows: [{ id: 'weekly', label: 'Weekly', usedPercent: 12 }], fetchedAt: 1_700_000_000_000 },
      }),
    })
    renderWithAccounts(operations)
    fireEvent.click(header())
    await screen.findAllByText('Weekly 12%')
  })

  it('shows nothing when the provider has no quota answer', async () => {
    const { face, operations } = harness()
    renderWithAccounts(operations)
    fireEvent.click(header())
    await waitFor(() => { expect(face.authorization.quota).toHaveBeenCalledTimes(3) })
    await waitFor(() => { expect(screen.queryByText(en.quotaChecking)).toBeNull() })
    expect(screen.queryByText(en.quotaFailed)).toBeNull()
  })

  it('marks quota refusals without hiding other rows', async () => {
    const { operations } = harness({
      quota: () => Promise.resolve({
        ok: false,
        error: new RemoteError('authorization/rejected', 'upstream down', { key: 'llm-pi-ai/anthropic' }),
      }),
    })
    renderWithAccounts(operations)
    fireEvent.click(header())
    await screen.findAllByText(en.quotaFailed)
    expect(screen.getByText('acct-bb')).toBeTruthy()
  })

  it('refreshes one account\'s quota from its row menu', async () => {
    const { face, operations } = harness()
    renderWithAccounts(operations)
    fireEvent.click(header())
    await waitFor(() => { expect(face.authorization.quota).toHaveBeenCalledTimes(3) })
    const overflow = screen.getAllByRole('button', { name: en.accountActions })[1]!
    // A second click on the open overflow button collapses it again.
    fireEvent.click(overflow)
    fireEvent.click(overflow)
    fireEvent.click(overflow)
    fireEvent.click(screen.getByRole('menuitem', { name: en.quotaRefresh }))
    await waitFor(() => { expect(face.authorization.quota).toHaveBeenCalledTimes(4) })
    expect(face.authorization.quota).toHaveBeenLastCalledWith('llm-pi-ai/anthropic', 'acct-bb')
  })

  it('signs out one account by its own record key after confirming', async () => {
    const { face, operations } = harness()
    renderWithAccounts(operations)
    fireEvent.click(header())
    fireEvent.click(screen.getAllByRole('button', { name: en.accountActions })[1]!)
    fireEvent.click(screen.getByRole('menuitem', { name: en.signOut }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(en.signOutConfirm.replace('{label}', 'acct-bb'))).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: en.signOut }))
    await waitFor(() => { expect(face.authorization.signOut).toHaveBeenCalledWith('llm-pi-ai/anthropic--acct-bb') })
  })

  it('abandons the sign-out however the dialog is dismissed', async () => {
    const { face, operations } = harness()
    renderWithAccounts(operations)
    fireEvent.click(header())
    const menus = screen.getAllByRole('button', { name: en.accountActions })
    fireEvent.click(menus[1]!)
    fireEvent.click(screen.getByRole('menuitem', { name: en.signOut }))
    let dialog = await screen.findByRole('dialog')
    // The dialog's own close control shares the footer Cancel's label.
    fireEvent.click(within(dialog).getAllByRole('button', { name: en.cancel })[0]!)
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    fireEvent.click(screen.getAllByRole('button', { name: en.accountActions })[1]!)
    fireEvent.click(screen.getByRole('menuitem', { name: en.signOut }))
    dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getAllByRole('button', { name: en.cancel }).at(-1)!)
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    expect(face.authorization.signOut).not.toHaveBeenCalled()
  })

  it('shows a blank header while the selection pointer resolves nowhere', () => {
    const { operations } = harness()
    renderWithAccounts(operations, ACCOUNTS.map(account => ({ ...account, selected: false })))
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('notes a running sign-in inside the expanded account block', () => {
    const { operations } = harness()
    render(<ProviderSignIn
      entry={{ ...OAUTH_ENTRY, configured: true, inFlight: true }}
      accounts={ACCOUNTS} operations={operations} t={t} disabled={false}
    />)
    expect(screen.getByText(en.signingIn)).toBeTruthy()
  })

  it('mints a fresh account slot when adding from a populated list', async () => {
    const { face, operations } = harness()
    stubTab()
    renderWithAccounts(operations)
    fireEvent.click(header())
    fireEvent.click(screen.getByRole('button', { name: en.accountAdd }))
    await waitFor(() => {
      expect(face.authorization.begin).toHaveBeenCalledWith('llm-pi-ai/anthropic', 'oauth', expect.stringMatching(/^acct-/))
    })
  })

  it('falls back to the lone sign-in state when the account join failed', async () => {
    const { face, operations } = harness()
    stubTab()
    renderSignIn(operations, { ...OAUTH_ENTRY, configured: true })
    expect(screen.getByText(en.accountSignedIn)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Claude' }))
    await waitFor(() => {
      expect(face.authorization.begin).toHaveBeenCalledWith('llm-pi-ai/anthropic', 'oauth', undefined)
    })
  })
})
