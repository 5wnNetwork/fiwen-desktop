/**
 * The subscription sign-in surface of one provider card: the interactive half
 * of `ctx.remote.authorization` rendered for a single credential record. The
 * card offers it when the provider's flow lists an OAuth method — the API-key
 * field beside it stays for providers that also take a key. A click preopens
 * the browser tab inside the gesture so a later `auth_url` notice can navigate
 * it without tripping the popup blocker; a tab that never navigates is closed
 * when the attempt settles. Unmounting cancels the attempt: its conversation
 * belongs to the card that started it, and a card that is gone cannot show
 * what the flow asks next.
 *
 * A flow that stores account records renders its account list instead of a
 * lone sign-in state: the collapsed row names the account requests currently
 * resolve to, and expanding it exposes each stored account with its select,
 * quota, and sign-out controls plus the add-account button. Every attempt the
 * card starts mints a fresh account slot, so a second sign-in never overwrites
 * the first.
 */

import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Button, IconCheckOutlineRegular, IconChevronDownOutlineRegular, IconEllipsisOutlineMedium,
  IconPlusOutlineRegular, IconRefreshOutlineRegular, IconTrashOutlineRegular, Menu, Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  AuthorizationAccountView, AuthorizationEntryView, AuthorizationNotice, AuthorizationPromptView,
} from '@deepseek-ai/dsh-api-remotes/client'
import type { AuthorizationQuotaOutcome, ModelsOperations } from './operations.ts'
import type { en } from './locales.ts'
import styles from './ModelsSection.module.css'

/** Props of {@link ProviderSignIn}. */
export interface ProviderSignInProps {
  /** The flow registered for this provider's credential record. */
  entry: AuthorizationEntryView
  /**
   * The accounts stored under the flow, joined for OAuth-capable flows.
   * `undefined` means the join failed or the flow predates accounts — the
   * surface then falls back to the base record's lone sign-in state.
   */
  accounts?: readonly AuthorizationAccountView[] | undefined
  /** The Host operations the sign-in conversation runs through. */
  operations: ModelsOperations
  /** Section copy. */
  t: (key: keyof typeof en) => string
  /** Disable every action while the card owns a write. */
  disabled: boolean
  /** Report whether an attempt is running so the card can hold still. */
  onBusyChange?: (busy: boolean) => void
}

/** One in-flight attempt's surface state. */
interface Attempt {
  /** The flow's reported notices, oldest first, trimmed to the recent few. */
  readonly log: readonly AuthorizationNotice[]
  /** The question the flow is waiting on, by its answer handle. */
  readonly prompt: { readonly id: string; readonly prompt: AuthorizationPromptView } | undefined
}

/**
 * The account slot a new sign-in commits under: a credential-key segment
 * (`acct-` plus a random tail), minted per attempt so two sign-ins to one
 * provider never collide on the same record.
 */
function mintAccount(): string {
  return `acct-${randomUUID().slice(0, 8)}`
}

/** One waiting question's answer form: a typed field, or a row of choices. */
function PromptForm(props: {
  readonly id: string
  readonly prompt: AuthorizationPromptView
  readonly operations: ModelsOperations
  readonly t: (key: keyof typeof en) => string
}): ReactNode {
  const [answer, setAnswer] = useState('')
  const { id, prompt, operations, t } = props
  if (prompt.kind === 'select') {
    return (
      <div className={styles['signInOptions']}>
        {prompt.options.map(option => (
          <button
            key={option.id}
            type="button"
            className={styles['secondaryButton']}
            title={option.description}
            onClick={() => { operations.answerAuthorizationPrompt(id, option.id) }}
          >
            {option.label}
          </button>
        ))}
      </div>
    )
  }
  return (
    <form
      className={styles['signInPrompt']}
      onSubmit={(event) => {
        event.preventDefault()
        operations.answerAuthorizationPrompt(id, answer)
      }}
    >
      <input
        className={styles['input']}
        type={prompt.kind === 'secret' ? 'password' : 'text'}
        value={answer}
        placeholder={prompt.placeholder}
        aria-label={prompt.message}
        autoFocus
        onChange={(event) => { setAnswer(event.target.value) }}
      />
      <button type="submit" className={styles['primaryButton']}>{t('signInContinue')}</button>
      <button
        type="button"
        className={styles['secondaryButton']}
        onClick={() => { operations.declineAuthorizationPrompt(id) }}
      >
        {t('cancel')}
      </button>
    </form>
  )
}

/** The name a surface gives one account: its flow-read label, or a fallback off the slot. */
function accountLabel(account: AuthorizationAccountView, t: (key: keyof typeof en) => string): string {
  if (account.label !== undefined) return account.label
  return account.account === '' ? t('accountBase') : account.account
}

/** One quota window's compact text: `5 hour 42%`. */
function windowLabel(quotaWindow: { readonly label: string; readonly usedPercent: number }): string {
  return `${quotaWindow.label} ${String(Math.round(quotaWindow.usedPercent))}%`
}

/**
 * The stale-credential marker for one account: the record's own access-token
 * expiry is what it reports, so a past stamp is honest even though the next
 * use or quota probe refreshes it — one that stays past after a probe is the
 * dead credential worth flagging.
 */
function ExpiredMark(props: {
  readonly at: number | undefined
  readonly t: (key: keyof typeof en) => string
}): ReactNode {
  const { at, t } = props
  if (at === undefined || at > Date.now()) return null
  return <span className={styles['accountExpired']} title={t('accountExpiredHint')}>{t('accountExpired')}</span>
}

/** The quota presentation of one account: plan plus windows, a failure line, or a pending hint. */
function QuotaChips(props: {
  readonly quota: AuthorizationQuotaOutcome | undefined
  readonly quotaBusy: boolean
  readonly t: (key: keyof typeof en) => string
}): ReactNode {
  const { quota, quotaBusy, t } = props
  const reported = quota?.kind === 'reported' ? quota.quota : undefined
  const resetAt = reported?.windows.find(quotaWindow => quotaWindow.resetAt !== undefined)?.resetAt
  if (reported !== undefined) {
    return (
      <span
        className={styles['quotaChips']}
        title={resetAt === undefined ? undefined : t('quotaReset').replace('{when}', () => new Date(resetAt).toLocaleString())}
      >
        {reported.plan === undefined ? null : <span className={styles['quotaPlan']}>{reported.plan}</span>}
        {reported.windows.map(quotaWindow => <span key={quotaWindow.id} className={styles['quotaChip']}>{windowLabel(quotaWindow)}</span>)}
      </span>
    )
  }
  if (quota?.kind === 'refused') {
    return <span className={styles['quotaFailed']} title={quota.message}>{t('quotaFailed')}</span>
  }
  return quotaBusy ? <span className={styles['quotaPending']}>{t('quotaChecking')}</span> : null
}

/**
 * One stored account's row: a whole-row radio that selects it for the
 * provider's requests, its quota windows, and an overflow menu holding the
 * quota refresh and the sign-out — the destructive action sits behind the
 * menu's confirm dialog instead of sharing the row as a bare text link.
 */
function AccountRow(props: {
  readonly account: AuthorizationAccountView
  readonly quota: AuthorizationQuotaOutcome | undefined
  readonly quotaBusy: boolean
  readonly t: (key: keyof typeof en) => string
  readonly disabled: boolean
  readonly menuOpen: boolean
  readonly onMenuOpen: () => void
  readonly onMenuClose: () => void
  readonly onSelect: (account: string) => void
  readonly onQuota: (account: string) => void
  readonly onSignOutRequest: (account: AuthorizationAccountView) => void
}): ReactNode {
  const { account, quota, quotaBusy, t, disabled, menuOpen } = props
  return (
    <li className={styles['accountRow']} data-selected={account.selected || undefined}>
      <button
        type="button"
        role="radio"
        aria-checked={account.selected}
        className={styles['accountSelect']}
        disabled={disabled}
        onClick={() => { if (!account.selected) props.onSelect(account.account) }}
      >
        <span className={styles['accountCheck']} aria-hidden="true">
          {account.selected ? <IconCheckOutlineRegular size={14} /> : null}
        </span>
        <span className={styles['accountLabel']}>{accountLabel(account, t)}</span>
        <ExpiredMark at={account.expiresAt} t={t} />
        <QuotaChips quota={quota} quotaBusy={quotaBusy} t={t} />
      </button>
      <Menu
        open={menuOpen}
        portal
        align="end"
        anchor={(
          <button
            type="button"
            className={styles['accountMenuButton']}
            aria-label={t('accountActions')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            disabled={disabled}
            onClick={() => { (menuOpen ? props.onMenuClose : props.onMenuOpen)() }}
          >
            <IconEllipsisOutlineMedium size={14} />
          </button>
        )}
        items={[
          { id: 'quota', label: t('quotaRefresh'), icon: <IconRefreshOutlineRegular size={16} /> },
          { type: 'separator', id: 'actions' },
          { id: 'signout', label: t('signOut'), icon: <IconTrashOutlineRegular size={16} />, danger: true },
        ]}
        onClose={props.onMenuClose}
        onSelect={(id) => {
          props.onMenuClose()
          // The menu emits only its two declared item ids.
          if (id === 'quota') props.onQuota(account.account)
          else props.onSignOutRequest(account)
        }}
      />
    </li>
  )
}

/**
 * Render the sign-in field for one OAuth-capable provider.
 * @param props - the flow entry, its stored accounts, the page's operations, and copy.
 * @returns the field, or nothing when the flow offers no OAuth method.
 */
export function ProviderSignIn(props: ProviderSignInProps): ReactNode {
  const { entry, accounts, operations, t, disabled } = props
  const [attempt, setAttempt] = useState<Attempt | undefined>(undefined)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [signingOut, setSigningOut] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [quotaByAccount, setQuotaByAccount] = useState<Readonly<Record<string, AuthorizationQuotaOutcome | undefined>>>({})
  const [quotaBusy, setQuotaBusy] = useState<string | undefined>(undefined)
  /** The record key whose overflow menu is open. */
  const [menuFor, setMenuFor] = useState<string | undefined>(undefined)
  /** The record awaiting the sign-out confirmation dialog. */
  const [confirmOut, setConfirmOut] = useState<{ readonly key: string; readonly label: string } | undefined>(undefined)
  // The card's own attempt marker: only an attempt this surface began is
  // cancelled on unmount, and only it reports busy outward.
  const running = useRef(false)
  const tab = useRef<Window | null>(null)
  const navigated = useRef(false)
  const { onBusyChange } = props
  useEffect(() => () => {
    if (running.current) operations.cancelAuthorization(entry.key)
    running.current = false
    onBusyChange?.(false)
    tab.current?.close()
    tab.current = null
  }, [operations, entry.key, onBusyChange])

  const oauth = entry.methods.find(method => method.id === 'oauth')
  if (oauth === undefined) return null

  const begin = (): void => {
    /* v8 ignore next -- the button is disabled while the card owns a write and unmounted while an attempt runs */
    if (running.current || disabled) return
    running.current = true
    navigated.current = false
    onBusyChange?.(true)
    setFailure(undefined)
    setAttempt({ log: [], prompt: undefined })
    // Inside the click gesture so the flow's URL can navigate it; a blocked
    // popup leaves the copy-link path in the notice list.
    tab.current = window.open('about:blank', '_blank')
    if (tab.current !== null) tab.current.opener = null
    // The account join decides where the grant lands: a flow that tracks
    // accounts writes a fresh slot so a second sign-in never overwrites the
    // first; one without accounts still writes its base record.
    void settle(accounts === undefined ? undefined : mintAccount())
  }

  const settle = async (account: string | undefined): Promise<void> => {
    const outcome = await operations.beginAuthorization(entry.key, 'oauth', account, {
      notice: (notice) => {
        if (notice.url !== undefined && !navigated.current) {
          navigated.current = true
          const pending = tab.current
          if (pending !== null && !pending.closed) pending.location.replace(notice.url)
          else window.open(notice.url, '_blank', 'noopener')
        }
        setAttempt((current) => {
          /* v8 ignore next -- the attempt's handler seat is released before its state clears, so no event meets an empty surface */
          if (current === undefined) return current
          return { ...current, log: [...current.log, notice].slice(-6) }
        })
      },
      prompt: (id, prompt) => {
        setAttempt((current) => {
          /* v8 ignore next -- same seat ordering as the notice handler above */
          if (current === undefined) return current
          return { ...current, prompt: { id, prompt } }
        })
      },
      promptWithdrawn: (id) => {
        setAttempt(current => current?.prompt?.id === id ? { ...current, prompt: undefined } : current)
      },
    })
    running.current = false
    onBusyChange?.(false)
    setAttempt(undefined)
    // A tab that never reached a sign-in page is dead weight; a navigated one
    // is the user's own browser session, left open on purpose.
    if (!navigated.current) {
      tab.current?.close()
      tab.current = null
    }
    if (outcome.kind === 'failed') setFailure(outcome.message)
    // A committed account just earned its slot; its quota probe runs off the
    // same gesture that signed it in.
    else if (account !== undefined) void quota(account)
  }

  const signOut = async (key: string): Promise<void> => {
    setSigningOut(true)
    setFailure(undefined)
    try {
      const message = await operations.signOutAuthorization(key)
      if (message !== undefined) setFailure(message)
      // Success needs no local flip: the record-updated push re-joins the row.
    } finally {
      setSigningOut(false)
    }
  }

  const select = async (account: string): Promise<void> => {
    const message = await operations.selectAuthorizationAccount(entry.key, account)
    if (message !== undefined) setFailure(message)
  }

  const quota = async (account: string): Promise<void> => {
    setQuotaBusy(account)
    try {
      const outcome = await operations.authorizationQuota(entry.key, account)
      setQuotaByAccount(current => ({ ...current, [account]: outcome }))
    } finally {
      setQuotaBusy(undefined)
    }
  }

  /**
   * Opening the list is the deliberate gesture the per-account probes wait
   * for: a fresh read fetches every account's quota once rather than a
   * click at a time, and a cached answer never refetches.
   */
  const toggleExpand = (list: readonly AuthorizationAccountView[]): void => {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    list.forEach((account) => {
      if (quotaByAccount[account.account] === undefined) void quota(account.account)
    })
  }

  // The URL/code affordances follow the most recent notice that carried one —
  // a trailing progress line must not hide what the human still needs.
  const lastUrl = attempt === undefined ? undefined : [...attempt.log].reverse().find(notice => notice.url !== undefined)?.url
  const lastCode = attempt === undefined ? undefined : [...attempt.log].reverse().find(notice => notice.code !== undefined)?.code
  const selected = accounts?.find(account => account.selected)
  const idle = accounts === undefined || accounts.length === 0
    ? (
      <div className={styles['signInRow']}>
        {accounts === undefined && entry.configured
          ? (
            <span className={styles['accountStatus']}>
              <span className={`${styles['credentialDot']} ${styles['credentialDotConfigured']}`} aria-hidden="true" />
              {t('accountSignedIn')}
            </span>
          )
          : null}
        {entry.inFlight
          ? <span className={styles['advancedHint']}>{t('signingIn')}</span>
          : (
            <button
              type="button"
              className={styles['secondaryButton']}
              disabled={disabled || signingOut}
              onClick={begin}
            >
              {oauth.label}
            </button>
          )}
        {accounts === undefined && entry.configured
          ? (
            <button
              type="button"
              className={styles['linkButton']}
              disabled={disabled || signingOut || entry.inFlight}
              onClick={() => { setConfirmOut({ key: entry.key, label: t('accountSignedIn') }) }}
            >
              {signingOut ? t('signingOut') : t('signOut')}
            </button>
          )
          : null}
      </div>
    )
    : (
      <div className={styles['accountBlock']}>
        <button
          type="button"
          className={styles['accountHeader']}
          aria-expanded={expanded}
          disabled={disabled}
          onClick={() => { toggleExpand(accounts) }}
        >
          <span className={`${styles['credentialDot']} ${styles['credentialDotConfigured']}`} aria-hidden="true" />
          <span className={styles['accountHeaderLabel']}>
            {selected === undefined ? '—' : accountLabel(selected, t)}
          </span>
          <ExpiredMark at={selected?.expiresAt} t={t} />
          <QuotaChips
            quota={selected === undefined ? undefined : quotaByAccount[selected.account]}
            quotaBusy={selected !== undefined && quotaBusy === selected.account}
            t={t}
          />
          <IconChevronDownOutlineRegular className={styles['accountChevron']} />
        </button>
        {entry.inFlight ? <span className={styles['advancedHint']}>{t('signingIn')}</span> : null}
        {expanded
          ? (
            <ul className={styles['accountList']} role="radiogroup" aria-label={t('subscription')}>
              {accounts.map(account => (
                <AccountRow
                  key={account.key}
                  account={account}
                  quota={quotaByAccount[account.account]}
                  quotaBusy={quotaBusy === account.account}
                  t={t}
                  disabled={disabled || signingOut || entry.inFlight}
                  menuOpen={menuFor === account.key}
                  onMenuOpen={() => { setMenuFor(account.key) }}
                  onMenuClose={() => { setMenuFor(undefined) }}
                  onSelect={(slot) => { void select(slot) }}
                  onQuota={(slot) => { void quota(slot) }}
                  onSignOutRequest={(view) => { setConfirmOut({ key: view.key, label: accountLabel(view, t) }) }}
                />
              ))}
              <li>
                <button
                  type="button"
                  className={styles['accountAdd']}
                  disabled={disabled || signingOut || entry.inFlight}
                  onClick={begin}
                >
                  <IconPlusOutlineRegular size={14} />
                  {t('accountAdd')}
                </button>
              </li>
            </ul>
          )
          : null}
      </div>
    )
  return (
    <div className={styles['field']}>
      <span className={styles['fieldLabel']}>{t('subscription')}</span>
      {attempt === undefined
        ? idle
        : (
          <div className={styles['signInAttempt']}>
            {attempt.log.map((notice, index) => (
              <p key={index} className={index === attempt.log.length - 1 ? styles['advancedHint'] : styles['signInLog']}>
                {notice.message}
              </p>
            ))}
            {lastUrl === undefined
              ? null
              : (
                <button
                  type="button"
                  className={styles['linkButton']}
                  onClick={() => { window.open(lastUrl, '_blank', 'noopener') }}
                >
                  {t('signInOpen')}
                </button>
              )}
            {lastCode === undefined
              ? null
              : <code className={styles['signInCode']}>{lastCode}</code>}
            {attempt.prompt === undefined
              ? null
              : <PromptForm id={attempt.prompt.id} prompt={attempt.prompt.prompt} operations={operations} t={t} />}
            <div>
              <button
                type="button"
                className={styles['linkButton']}
                onClick={() => { operations.cancelAuthorization(entry.key) }}
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        )}
      {failure === undefined ? null : <p className={styles['error']}>{failure}</p>}
      {confirmOut === undefined
        ? null
        : (
          <Modal
            open
            title={t('signOut')}
            closeLabel={t('cancel')}
            description={t('signOutConfirm').replace('{label}', () => confirmOut.label)}
            onClose={() => { setConfirmOut(undefined) }}
            footer={(
              <>
                <Button variant="outline" onClick={() => { setConfirmOut(undefined) }}>{t('cancel')}</Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    const { key } = confirmOut
                    setConfirmOut(undefined)
                    void signOut(key)
                  }}
                >
                  {t('signOut')}
                </Button>
              </>
            )}
          />
        )}
    </div>
  )
}
