/** Marketplace: search the Fiwen catalog, read an item's page, and install or uninstall it. */
import { useEffect, useState, type ReactNode } from 'react'
import {
  Button, IconChevronDownOutlineRegular, IconChevronLeftOutlineRegular, IconRefreshOutlineRegular,
  IconSearchOutlineRegular, IconWarningOutlineRegular, Input, Menu, Pill, PluginArtworkDefault, StateDot, Tag, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MarketItemDetail, MarketItemKind, MarketItemView } from '@deepseek-ai/dsh-api-remotes/client'
import type { CatalogFailure, MarketFace, MarketState, WorkFailure } from './market-store.ts'
import css from './MarketSection.module.css'

/** Props of the Marketplace tab. */
export type MarketSectionProps = PropsRuntime<'plugins.tab'> & PropsLocale<'market'> & InjectFace<MarketFace>

type Translate = MarketSectionProps['t']

/** The injected actions, without the reactive sources the renderer binds as hooks. */
type MarketActions = Omit<MarketFace, 'hooks'>

/** Typing pause before the query text is sent. */
const TEXT_DELAY_MS = 250
/** Artwork size inside the 48px icon frame, as on the Installed tab. */
const ICON = 36

const FAILURE_KEYS = {
  fetch: 'readFailed',
  invalid: 'readFailed',
} as const satisfies Record<CatalogFailure, string>

const WORK_FAILURE_KEYS = {
  auth: 'signInRequired',
  conflict: 'conflictSkill',
  'no-profile': 'noProfile',
  other: 'installFailed',
} as const satisfies Record<WorkFailure, string>

const KIND_KEYS = {
  skill: 'kindSkill',
  mcp: 'kindMcp',
} as const satisfies Record<MarketItemKind, string>

const SORT_IDS = ['popular', 'unique', 'newest', 'name'] as const
type SortId = (typeof SORT_IDS)[number]

const SORT_KEYS = {
  popular: 'sortPopular',
  unique: 'sortUnique',
  newest: 'sortNewest',
  name: 'sortName',
} as const satisfies Record<SortId, string>

function ItemIcon({ src, size }: { readonly src: string | null; readonly size: number }): ReactNode {
  const [failed, setFailed] = useState<string | null>(null)
  return src === null || src === failed
    ? <PluginArtworkDefault size={size} />
    : (
      <img className={css.image} src={src} width={size} height={size} alt="" loading="lazy" referrerPolicy="no-referrer"
        onError={() => { setFailed(src) }} />
    )
}

function workFailureText(failure: NonNullable<MarketState['workFailure']>, t: Translate, name: string | undefined): string {
  if (failure.kind === 'conflict') return t('conflictSkill')
  return t(WORK_FAILURE_KEYS[failure.kind], { name: name ?? '' })
}

function ItemAction({ item, title, state, t, face }: {
  readonly item: MarketItemView
  readonly title: string
  readonly state: MarketState
  readonly t: Translate
  readonly face: MarketActions
}): ReactNode {
  const busy = state.busy[item.id]
  if (busy === 'install') return <Button variant="outline" size="sm" disabled>{t('installing')}</Button>
  if (busy === 'uninstall') return <Button variant="ghost" size="sm" disabled>{t('uninstalling')}</Button>
  if (state.installed[item.id] !== undefined) {
    return (
      <Button variant="ghost" size="sm" aria-label={t('uninstallTitle', { name: title })} onClick={() => { face.uninstall(item.id) }}>
        {t('installed')}
      </Button>
    )
  }
  return (
    <Button variant="outline" size="sm" aria-label={t('installTitle', { name: title })} onClick={() => { face.install(item.id) }}>
      {t('install')}
    </Button>
  )
}

function ItemCard({ item, state, t, face, onOpen }: {
  readonly item: MarketItemView
  readonly state: MarketState
  readonly t: Translate
  readonly face: MarketActions
  readonly onOpen: () => void
}): ReactNode {
  const title = face.resolveText(item.title)
  return (
    <li className={css.card}>
      <button type="button" className={css.cardMain} aria-label={t('openItem', { name: title })} onClick={onOpen}>
        <span className={css.icon} aria-hidden="true"><ItemIcon src={item.icon} size={ICON} /></span>
        <span className={css.main}>
          <span className={css.title}>
            <span className={css.strong}>{title}</span>
            <Tag>{t(KIND_KEYS[item.kind])}</Tag>
          </span>
          <span className={css.description}>{face.resolveText(item.summary)}</span>
          <span className={css.meta}>
            {t('downloads', { count: String(item.downloads) })}
            {' · '}
            {t('uniqueDownloads', { count: String(item.uniqueDownloads) })}
            {' · '}
            {item.version}
          </span>
        </span>
      </button>
      <ItemAction item={item} title={title} state={state} t={t} face={face} />
    </li>
  )
}

function DetailView({ detail, state, t, face, onBack }: {
  readonly detail: MarketItemDetail
  readonly state: MarketState
  readonly t: Translate
  readonly face: MarketActions
  readonly onBack: () => void
}): ReactNode {
  const title = face.resolveText(detail.title)
  const category = state.categories.find(entry => entry.id === detail.categoryId)
  return (
    <div className={css.detail}>
      <div className={css.detailHead}>
        <Button variant="ghost" size="sm" icon={<IconChevronLeftOutlineRegular size={14} />} onClick={onBack}>
          {t('backToList')}
        </Button>
      </div>
      <div className={css.confirmHead}>
        <span className={css.icon} aria-hidden="true"><ItemIcon src={detail.icon} size={ICON} /></span>
        <div className={css.main}>
          <span className={css.title}>
            <span className={css.strong}>{title}</span>
            <Tag>{t(KIND_KEYS[detail.kind])}</Tag>
          </span>
          <span className={css.meta}>
            {t('downloads', { count: String(detail.downloads) })}
            {' · '}
            {t('uniqueDownloads', { count: String(detail.uniqueDownloads) })}
          </span>
        </div>
        <ItemAction item={detail} title={title} state={state} t={t} face={face} />
      </div>
      <dl className={css.facts}>
        <div><dt>{t('factKind')}</dt><dd>{t(KIND_KEYS[detail.kind])}</dd></div>
        <div><dt>{t('factVersion')}</dt><dd>{detail.version}</dd></div>
        {detail.author === null ? null : <div><dt>{t('factAuthor')}</dt><dd>{detail.author}</dd></div>}
        {detail.homepage === null ? null : (
          <div><dt>{t('factHomepage')}</dt><dd><a href={detail.homepage} target="_blank" rel="noreferrer">{detail.homepage}</a></dd></div>
        )}
        {category === undefined ? null : <div><dt>{t('factCategory')}</dt><dd>{face.resolveText(category.title)}</dd></div>}
      </dl>
      {detail.description === null ? null : (
        <section className={css.detailSection}>
          <h4 className={css.sectionTitle}>{t('detailAbout')}</h4>
          <p className={css.about}>{face.resolveText(detail.description)}</p>
        </section>
      )}
    </div>
  )
}

function ListSkeleton({ label }: { readonly label: string }): ReactNode {
  return (
    <ul className={css.cards} role="status" aria-label={label} aria-busy="true">
      {[0, 1, 2, 3].map(index => (
        <li key={index} className={css.card} aria-hidden="true">
          <span className={`${css.icon} ${css.skeletonFill}`} />
          <div className={css.main}>
            <span className={`${css.skeletonBar} ${css.skeletonTitle} ${css.skeletonFill}`} />
            <span className={`${css.skeletonBar} ${css.skeletonDescription} ${css.skeletonFill}`} />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** The toolbar menu that is open; at most one is. */
type OpenMenu = 'kind' | 'sort' | null

function Browser({ state, t, face, onOpen }: {
  readonly state: MarketState
  readonly t: Translate
  readonly face: MarketActions
  readonly onOpen: (id: string) => void
}): ReactNode {
  const { query } = state
  const [text, setText] = useState(query.q ?? '')
  const [menu, setMenu] = useState<OpenMenu>(null)
  useEffect(() => {
    const trimmed = text.trim()
    if (trimmed === (query.q ?? '')) return undefined
    const timer = setTimeout(() => { face.search({ ...query, q: trimmed === '' ? undefined : trimmed }) }, TEXT_DELAY_MS)
    return () => { clearTimeout(timer) }
  }, [text, query, face])
  const sort: SortId = (SORT_IDS as readonly string[]).includes(query.sort ?? '') ? query.sort as SortId : 'popular'
  const kind: MarketItemKind | undefined = query.kind
  const toggleMenu = (name: Exclude<OpenMenu, null>): void => { setMenu(menu === name ? null : name) }
  const busy = state.status === 'loading' || state.status === 'more'
  const failedItem = state.workFailure === null ? undefined
    : state.items.find(item => item.id === state.workFailure?.id)
  return (
    <>
      <div className={css.toolbar}>
        <Input className={css.search as string} type="search" icon={<IconSearchOutlineRegular size={14} />} value={text}
          placeholder={t('searchPlaceholder')} aria-label={t('search')} onChange={(event) => { setText(event.target.value) }} />
        <Menu open={menu === 'kind'} onClose={() => { setMenu(null) }} portal autoFocus align="end"
          selectedId={kind ?? 'all'}
          items={[
            { id: 'all', label: t('kindAll') },
            { id: 'skill', label: t('kindSkill') },
            { id: 'mcp', label: t('kindMcp') },
          ]}
          onSelect={(id) => {
            setMenu(null)
            face.search({ ...query, kind: id === 'all' ? undefined : id as MarketItemKind })
          }}
          anchor={(
            <Button variant="ghost" size="sm" aria-haspopup="menu" aria-expanded={menu === 'kind'} onClick={() => { toggleMenu('kind') }}>
              {t(kind === undefined ? 'kindAll' : KIND_KEYS[kind])}
              <IconChevronDownOutlineRegular size={12} aria-hidden="true" />
            </Button>
          )} />
        <Menu open={menu === 'sort'} onClose={() => { setMenu(null) }} portal autoFocus align="end" selectedId={sort}
          items={SORT_IDS.map(id => ({ id, label: t(SORT_KEYS[id]) }))}
          onSelect={(id) => {
            setMenu(null)
            face.search({ ...query, sort: id as SortId })
          }}
          anchor={(
            <Button variant="ghost" size="sm" aria-haspopup="menu" aria-expanded={menu === 'sort'} onClick={() => { toggleMenu('sort') }}>
              {t('sortBy', { sort: t(SORT_KEYS[sort]) })}
              <IconChevronDownOutlineRegular size={12} aria-hidden="true" />
            </Button>
          )} />
        <Tooltip label={t('refresh')} side="bottom" portal delayMs={500} focusDelayMs={500}>
          <Button variant="ghost" size="sm" aria-label={t('refresh')} disabled={state.status === 'loading'} onClick={face.refresh}
            icon={busy ? <StateDot state="ongoing" /> : <IconRefreshOutlineRegular size={14} />} />
        </Tooltip>
      </div>
      {state.categories.length === 0 ? null : (
        <div className={css.categories} role="group" aria-label={t('categoriesLabel')}>
          <Pill active={query.category === undefined} aria-pressed={query.category === undefined}
            onClick={() => { face.search({ ...query, category: undefined }) }}>
            {t('allCategories')}
          </Pill>
          {state.categories.map(category => (
            <Pill key={category.id} active={query.category === category.id} aria-pressed={query.category === category.id}
              onClick={() => { face.search({ ...query, category: category.id }) }}>
              {face.resolveText(category.title)}
            </Pill>
          ))}
        </div>
      )}
      {state.status !== 'error' ? null : (
        <div className={css.failure}>
          <p className={css.error} role="alert">
            <StateDot state="error" />{t(FAILURE_KEYS[state.failure ?? 'fetch'])}
          </p>
          <Button variant="outline" size="sm" onClick={face.retry}>{t('retry')}</Button>
        </div>
      )}
      {state.workFailure === null ? null : (
        <p className={css.error} role="alert">
          <IconWarningOutlineRegular size={14} aria-hidden="true" />
          {workFailureText(state.workFailure, t, failedItem === undefined ? undefined : face.resolveText(failedItem.title))}
        </p>
      )}
      {state.status === 'loading' && state.items.length === 0
        ? <ListSkeleton label={t('loading')} />
        : state.items.length === 0 && state.status === 'ready'
          ? <p className={css.muted}>{t(state.answered?.q === undefined ? 'emptyCatalog' : 'noMatches')}</p>
          : (
            <>
              <ul className={css.cards} aria-busy={busy}>
                {state.items.map(item => (
                  <ItemCard key={item.id} item={item} state={state} t={t} face={face}
                    onOpen={() => { onOpen(item.id) }} />
                ))}
              </ul>
              {state.items.length >= state.total
                ? null
                : (
                  <Button variant="outline" size="sm" className={css.more} disabled={state.status !== 'ready'} onClick={face.more}>
                    {t('showMore')}
                  </Button>
                )}
            </>
          )}
    </>
  )
}

/** Render the Marketplace tab of the Plugins page. */
export function MarketSection(props: MarketSectionProps): ReactNode {
  const { t } = props
  const face: MarketActions = props
  const state = props.useMarket(snapshot => snapshot)
  const [opened, setOpened] = useState<{ readonly id: string; readonly detail: MarketItemDetail | null } | null>(null)
  useEffect(() => { props.ensure() }, [props.ensure])
  const open = (id: string): void => {
    setOpened({ id, detail: null })
    void face.detail(id).then((detail) => { setOpened({ id, detail }) })
  }
  if (opened !== null) {
    if (opened.detail !== null) {
      return (
        <DetailView detail={opened.detail} state={state} t={t} face={face} onBack={() => { setOpened(null) }} />
      )
    }
    return <ListSkeleton label={t('loading')} />
  }
  return <Browser state={state} t={t} face={face} onOpen={open} />
}
