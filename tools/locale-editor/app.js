/* global fetch, document, window, navigator */
'use strict'

const state = {
  entries: [],
  filter: 'all',
  sort: 'name',
  search: '',
  activeEntry: null,
  edited: new Set(), // "entryId|key" rows saved this session
}

const ROW_CAP = 500
const strip = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const rowId = (e, r) => `${e.id}|${JSON.stringify(r.key)}`

const entriesEl = document.getElementById('entries')
const tbody = document.querySelector('#rows tbody')
const pathEl = document.getElementById('path')
const statusEl = document.getElementById('status')

async function load() {
  statusEl.textContent = 'Loading…'
  const res = await fetch('/api/entries')
  const data = await res.json()
  state.entries = data.entries
  if (!state.entries.some(e => e.id === state.activeEntry)) {
    state.activeEntry = state.entries[0]?.id ?? null
  }
  renderSidebar()
  renderRows()
}

function entryStats(e) {
  const missing = e.rows.filter(r => r.vi === null).length
  const same = e.rows.filter(r => typeof r.vi === 'string' && r.vi === r.en).length
  return { missing, same, total: e.rows.length }
}

const GROUPS = [
  ['client', 'Client UI'],
  ['desktop', 'Desktop shell'],
  ['plugin', 'Plugin metadata'],
]

function renderSidebar() {
  entriesEl.textContent = ''
  for (const [group, title] of GROUPS) {
    const list = state.entries.filter(e => e.group === group)
    if (list.length === 0) continue
    const head = document.createElement('div')
    head.className = 'group-head'
    head.textContent = title
    entriesEl.append(head)
    list.sort(state.sort === 'missing'
      ? (a, b) => entryStats(b).missing - entryStats(a).missing || a.label.localeCompare(b.label)
      : (a, b) => a.label.localeCompare(b.label))
    for (const e of list) {
      const s = entryStats(e)
      const btn = document.createElement('button')
      btn.className = `entry${e.id === state.activeEntry ? ' active' : ''}`
      const label = document.createElement('span')
      label.className = 'label'
      label.textContent = e.namespace ? `${e.namespace} — ${e.label}` : e.label
      const meta = document.createElement('span')
      meta.className = 'meta'
      meta.innerHTML = `${s.total} keys · <span class="miss">${s.missing} missing</span> · <span class="same">${s.same} same</span>`
      btn.append(label, meta)
      btn.onclick = () => { state.activeEntry = e.id; renderSidebar(); renderRows() }
      entriesEl.append(btn)
    }
  }
}

function keyDisplay(key) { return Array.isArray(key) ? key.join(' › ') : key }

function matches(e, r) {
  const q = strip(state.search)
  if (q) {
    const hay = [keyDisplay(r.key), r.en, r.zh, r.vi].map(strip).join('\n')
    if (!hay.includes(q)) return false
  }
  switch (state.filter) {
    case 'missing': return r.vi === null
    case 'same': return typeof r.vi === 'string' && r.vi === r.en
    case 'edited': return state.edited.has(rowId(e, r))
    default: return true
  }
}

function warnings(r) {
  const out = []
  if (typeof r.en !== 'string' || r.en === '(unavailable)') return out
  const tokens = s => new Set([...String(s ?? '').matchAll(/\{[^}]+\}/g)].map(m => m[0]))
  const a = tokens(r.en), b = tokens(r.vi)
  const diff = [...a].filter(t => !b.has(t)).concat([...b].filter(t => !a.has(t)))
  if (diff.length) out.push(`placeholders differ: ${diff.join(', ')}`)
  if (typeof r.vi === 'string' && r.vi !== ''
    && (/^\s|\s$/.test(r.en)) !== (/^\s|\s$/.test(r.vi))) {
    out.push('leading/trailing whitespace differs from English')
  }
  return out
}

function renderRows() {
  tbody.textContent = ''
  const searching = state.search !== '' || state.filter !== 'all'
  const entries = searching
    ? state.entries
    : state.entries.filter(e => e.id === state.activeEntry)
  let shown = 0, total = 0, truncated = false
  let pathText = ''
  for (const e of entries) {
    const rows = e.rows.filter(r => matches(e, r))
    total += rows.length
    if (rows.length === 0) continue
    if (searching) {
      const tr = document.createElement('tr')
      tr.className = 'entry-head'
      const td = document.createElement('td')
      td.colSpan = 4
      td.textContent = `${e.file}${e.upstreamReason ? `  (en/zh unavailable: ${e.upstreamReason})` : ''}`
      tr.append(td)
      tbody.append(tr)
    } else {
      pathText = e.file
    }
    for (const r of rows) {
      if (shown >= ROW_CAP) { truncated = true; break }
      shown++
      tbody.append(renderRow(e, r))
    }
    if (truncated) break
  }
  pathEl.textContent = pathText || (searching ? '(multiple entries)' : '')
  statusEl.textContent = truncated
    ? `Showing ${shown} of ${total} matching rows — refine the search.`
    : `${total} row${total === 1 ? '' : 's'}`
}

function renderRow(entry, row) {
  const tr = document.createElement('tr')
  const id = rowId(entry, row)

  const keyTd = document.createElement('td')
  keyTd.className = 'key'
  keyTd.title = 'Click to copy'
  keyTd.textContent = keyDisplay(row.key)
  keyTd.onclick = () => navigator.clipboard.writeText(keyDisplay(row.key))
  if (row.viOnly) keyTd.append(badge('vi-only', 'vionly'))

  const enTd = cell(row.en)
  const zhTd = cell(row.zh)

  const viTd = document.createElement('td')
  viTd.className = 'vi'
  const ta = document.createElement('textarea')
  ta.rows = 1
  ta.value = row.vi === null ? '' : (row.vi === '(unavailable)' ? '' : row.vi)
  if (row.vi === '(unavailable)') { ta.disabled = true; ta.placeholder = '(unavailable)' }
  ta.dataset.loaded = row.vi === null ? '' : row.vi
  const msg = document.createElement('div')
  msg.className = 'rowmsg'
  viTd.append(ta, msg)
  if (row.vi === null) viTd.append(badge('missing — falls back to English', 'missing'))
  for (const w of warnings(row)) {
    const d = document.createElement('div')
    d.className = 'rowmsg warn'
    d.textContent = `⚠ ${w}`
    viTd.append(d)
  }

  const grow = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px` }
  requestAnimationFrame(grow)
  ta.addEventListener('input', () => {
    grow()
    ta.classList.toggle('dirty', ta.value !== ta.dataset.loaded)
  })
  ta.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') {
      ta.value = ta.dataset.loaded
      ta.classList.remove('dirty', 'saved', 'error')
      msg.textContent = ''
      ta.blur()
    } else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault()
      ta.blur()
    } else if (ev.key === 'Tab' && !ev.shiftKey) {
      ev.preventDefault()
      const tas = [...tbody.querySelectorAll('textarea:not(:disabled)')]
      tas[tas.indexOf(ta) + 1]?.focus()
    }
  })
  ta.addEventListener('blur', () => {
    if (ta.value === ta.dataset.loaded) { ta.classList.remove('dirty'); return }
    save(entry, row, ta, msg, id)
  })
  tr.append(keyTd, enTd, zhTd, viTd)
  return tr
}

function cell(text) {
  const td = document.createElement('td')
  td.className = 'ref'
  if (text === '(unavailable)') { td.classList.add('unavail'); td.textContent = text }
  else td.textContent = text ?? ''
  return td
}

function badge(text, cls) {
  const b = document.createElement('span')
  b.className = `badge ${cls}`
  b.textContent = text
  return b
}

async function save(entry, row, ta, msg, id) {
  ta.classList.remove('dirty', 'saved', 'error')
  ta.classList.add('saving')
  msg.textContent = 'saving…'
  msg.className = 'rowmsg'
  const expected = row.vi === null ? null : row.vi
  try {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entryId: entry.id, key: row.key, value: ta.value, expected }),
    })
    const data = await res.json()
    ta.classList.remove('saving')
    if (res.ok) {
      row.vi = ta.value
      ta.dataset.loaded = ta.value
      ta.classList.add('saved')
      msg.textContent = 'saved'
      msg.classList.add('ok')
      state.edited.add(id)
      renderSidebar()
      setTimeout(() => ta.classList.remove('saved'), 1500)
    } else if (res.status === 409) {
      ta.classList.add('error')
      msg.textContent = `${data.error ?? 'conflict'} — current on disk: ${JSON.stringify(data.current)}`
      msg.classList.add('err')
    } else {
      ta.classList.add('error')
      msg.textContent = data.error ?? `save failed (${res.status})`
      msg.classList.add('err')
    }
  } catch (error) {
    ta.classList.remove('saving')
    ta.classList.add('error')
    msg.textContent = String(error)
    msg.classList.add('err')
  }
}

document.getElementById('search').addEventListener('input', ev => {
  state.search = ev.target.value
  renderRows()
})
document.querySelectorAll('#chips button').forEach(b => {
  b.onclick = () => {
    state.filter = b.dataset.filter
    document.querySelectorAll('#chips button').forEach(x => x.classList.toggle('on', x === b))
    renderRows()
  }
})
document.querySelectorAll('#sortbar button').forEach(b => {
  b.onclick = () => {
    state.sort = b.dataset.sort
    document.querySelectorAll('#sortbar button').forEach(x => x.classList.toggle('on', x === b))
    renderSidebar()
  }
})
document.getElementById('reload').onclick = load
document.getElementById('copyPath').onclick = () => navigator.clipboard.writeText(pathEl.textContent)

load()
