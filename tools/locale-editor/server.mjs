#!/usr/bin/env node
/**
 * tools/locale-editor — manual Vietnamese translation editor.
 *
 * Serves a small web UI (127.0.0.1 only) that lists every Vietnamese locale
 * entry in this checkout: client dictionaries (packages/client/locale-vi),
 * the desktop shell dictionary (apps/desktop/src/locale.ts), and plugin
 * metadata locale JSON directories. Each row shows English and Chinese for
 * reference next to an editable Vietnamese value; saves write back into the
 * real source files (conflict-checked, EOL-preserving, atomic rename).
 *
 * Run:  node tools/locale-editor/server.mjs [--port 4319]
 * Deps: Node >= 22 builtins only, plus the repo's own `typescript` package
 *       loaded via createRequire for AST parsing. No other dependencies.
 *
 * API:  GET  /api/entries            → { entries: [...] } (re-scans files)
 *       POST /api/save {entryId, key, value, expected}
 *         TS entries: `key` is the dictionary key string.
 *         JSON entries: `key` is an array of path segments.
 *         `expected` is the vi value the client loaded (null when missing);
 *         a mismatch returns 409 so the UI can ask for a reload.
 */
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import {
  existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

const TOOL_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(TOOL_DIR, '..', '..')
const ts = createRequire(join(ROOT, 'package.json'))('typescript')
const UNAVAILABLE = '(unavailable)'

// ---------------------------------------------------------------- utilities

const detectEol = (text) => (text.includes('\r\n') ? '\r\n' : '\n')

function atomicWrite(file, content) {
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  writeFileSync(tmp, content)
  renameSync(tmp, file)
}

function emitTsString(value) {
  return `'${value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')}'`
}

function unwrapExpression(node) {
  while (
    ts.isParenthesizedExpression(node)
    || ts.isAsExpression(node)
    || ts.isSatisfiesExpression(node)
    || ts.isTypeAssertionExpression(node)
  ) node = node.expression
  return node
}

function propKeyName(node) {
  const name = node.name
  if (name === undefined) return undefined
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return undefined
}

/** Parse a TS file: exported const objects, all top-level const objects, named imports. */
function parseLocaleFile(fileText) {
  const sf = ts.createSourceFile('locale.ts', fileText, ts.ScriptTarget.Latest, true)
  const objects = new Map()
  const locals = new Map()
  const scalars = new Map() // const name → string literal value
  const imports = new Map() // local alias → {spec, imported}
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)
      && st.importClause?.namedBindings !== undefined
      && ts.isNamedImports(st.importClause.namedBindings)) {
      for (const el of st.importClause.namedBindings.elements) {
        imports.set(el.name.text, {
          spec: st.moduleSpecifier.text,
          imported: (el.propertyName ?? el.name).text,
        })
      }
      continue
    }
    if (!ts.isVariableStatement(st)) continue
    const exported = st.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
    for (const decl of st.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.initializer === undefined) continue
      const init = unwrapExpression(decl.initializer)
      if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
        scalars.set(decl.name.text, init.text)
        continue
      }
      if (!ts.isObjectLiteralExpression(init)) continue
      locals.set(decl.name.text, init)
      if (exported) objects.set(decl.name.text, init)
    }
  }
  return { sf, objects, locals, scalars, imports }
}

const parsedCache = new Map()
function parseFile(file) {
  let hit = parsedCache.get(file)
  if (hit === undefined) {
    hit = parseLocaleFile(readFileSync(file, 'utf8'))
    parsedCache.set(file, hit)
  }
  return hit
}

/** Identifier → object literal or string, following same-file consts and relative imports. */
function makeResolver(file) {
  const { locals, scalars, imports } = parseFile(file)
  const dir = dirname(file)
  const imported = (name, depth) => {
    const imp = imports.get(name)
    if (imp === undefined || !imp.spec.startsWith('.') || depth > 4) return undefined
    const target = join(dir, imp.spec)
    if (!existsSync(target)) return undefined
    return { parsed: parseFile(target), exported: imp.imported }
  }
  return {
    object(name, depth = 0) {
      if (locals.has(name)) return locals.get(name)
      const t = imported(name, depth)
      return t === undefined ? undefined : (t.parsed.objects.get(t.exported) ?? t.parsed.locals.get(t.exported))
    },
    scalar(name, depth = 0) {
      if (scalars.has(name)) return scalars.get(name)
      const t = imported(name, depth)
      return t === undefined ? undefined : t.parsed.scalars.get(t.exported)
    },
  }
}

/**
 * Static string value of an expression, or undefined: literal, identifier
 * (via resolver), `a + b` concatenation, `[...].join(sep)`, string array.
 */
function stringValueOf(node, resolveIdent, depth) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isIdentifier(node) && resolveIdent !== undefined) {
    return resolveIdent.scalar(node.text, depth + 1)
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = stringValueOf(unwrapExpression(node.left), resolveIdent, depth)
    const r = stringValueOf(unwrapExpression(node.right), resolveIdent, depth)
    return l === undefined || r === undefined ? undefined : l + r
  }
  let arr = ts.isArrayLiteralExpression(node) ? node : undefined
  let sepText = '\n\n'
  if (arr === undefined && ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === 'join'
    && ts.isArrayLiteralExpression(node.expression.expression)
    && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
    arr = node.expression.expression
    sepText = node.arguments[0].text
  }
  if (arr !== undefined && arr.elements.every(e => ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e))) {
    return arr.elements.map(e => e.text).join(sepText)
  }
  return undefined
}

/**
 * Object literal → ordered rows [{key, value|undefined(unavailable), node|null}].
 * `...spread` identifiers are resolved through resolveIdent when provided.
 */
function dictRows(obj, resolveIdent, depth = 0) {
  const rows = []
  for (const prop of obj.properties) {
    if (ts.isSpreadAssignment(prop)) {
      if (resolveIdent !== undefined && ts.isIdentifier(prop.expression)) {
        const target = resolveIdent.object(prop.expression.text, depth + 1)
        if (target !== undefined) rows.push(...dictRows(target, resolveIdent, depth + 1))
      }
      continue
    }
    if (!ts.isPropertyAssignment(prop)) continue
    const key = propKeyName(prop)
    if (key === undefined) continue
    const init = unwrapExpression(prop.initializer)
    if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
      rows.push({ key, value: init.text, node: init })
    } else {
      rows.push({ key, value: stringValueOf(init, resolveIdent, depth), node: null })
    }
  }
  return rows
}

/** Choose the Vietnamese dictionary export inside a locale-vi file. */
function pickViObject(objects, preferName) {
  if (preferName !== undefined && objects.has(preferName)) return preferName
  if (objects.has('vi')) return 'vi'
  const viSuffixed = [...objects.keys()].filter(n => n.endsWith('Vi'))
  if (viSuffixed.length === 1) return viSuffixed[0]
  if (objects.size === 1) return [...objects.keys()][0]
  return undefined
}

/** `{a:{b:'x'}}` → ordered leaf rows [{path:['a','b'], value:'x'}]; strings only. */
function jsonRows(value, prefix, out) {
  if (typeof value === 'string') {
    out.push({ path: prefix, value })
  } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of Object.keys(value)) jsonRows(value[k], [...prefix, k], out)
  }
  return out
}

function jsonGet(obj, path) {
  let cur = obj
  for (const k of path) {
    if (cur === null || typeof cur !== 'object' || Array.isArray(cur)) return undefined
    cur = cur[k]
  }
  return cur
}

function jsonSet(obj, path, value) {
  let cur = obj
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i]
    if (cur[k] === null || typeof cur[k] !== 'object' || Array.isArray(cur[k])) cur[k] = {}
    cur = cur[k]
  }
  cur[path[path.length - 1]] = value
}

// --------------------------------------------------------------- workspace

const pkgDirCache = new Map()
function packageDirs() {
  if (pkgDirCache.size > 0) return pkgDirCache
  const roots = []
  for (const group of readdirSync(join(ROOT, 'packages'))) roots.push(join(ROOT, 'packages', group))
  roots.push(join(ROOT, 'apps'), join(ROOT, 'vendor'))
  for (const groupDir of roots) {
    let kids = []
    try { kids = readdirSync(groupDir) } catch { continue }
    for (const kid of kids) {
      const pkgJson = join(groupDir, kid, 'package.json')
      if (!existsSync(pkgJson)) continue
      try {
        const name = JSON.parse(readFileSync(pkgJson, 'utf8')).name
        if (typeof name === 'string') pkgDirCache.set(name, join(groupDir, kid))
      } catch { /* unreadable package.json: skip */ }
    }
  }
  return pkgDirCache
}

// ------------------------------------------------------------- entry scan

const SKIP_DIRS = new Set(['node_modules', 'lib', 'dist', '.git'])

function isFixturePath(parts) {
  const i = parts.findIndex(p => p === 'tests' || p === 'test')
  return i >= 0 && parts[i + 1] === 'fixtures'
}

function walk(dir, relParts, out) {
  let names = []
  try { names = readdirSync(dir) } catch { return }
  if (isFixturePath(relParts)) return
  if (relParts.includes('locale') && names.includes('en.json')) {
    out.push(relParts.join('/'))
  }
  for (const name of names) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue
    const child = join(dir, name)
    try { if (!statSync(child).isDirectory()) continue } catch { continue }
    walk(child, [...relParts, name], out)
  }
}

function clientNamespaceMap() {
  // index.ts: `import { vi as foo } from './x.ts'` + `'ns': foo` in VI_DICTIONARIES.
  const file = join(ROOT, 'packages/client/locale-vi/src/locales/index.ts')
  const map = new Map()
  try {
    const sf = ts.createSourceFile('index.ts', readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const aliasToFile = new Map()
    const nsToAlias = new Map()
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)
        && st.importClause?.namedBindings !== undefined
        && ts.isNamedImports(st.importClause.namedBindings)) {
        const spec = st.moduleSpecifier.text
        for (const el of st.importClause.namedBindings.elements) {
          aliasToFile.set(el.name.text, spec)
        }
      }
      if (ts.isVariableStatement(st)) {
        for (const decl of st.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name) || decl.name.text !== 'VI_DICTIONARIES') continue
          const init = decl.initializer === undefined ? undefined : unwrapExpression(decl.initializer)
          if (init === undefined || !ts.isObjectLiteralExpression(init)) continue
          for (const prop of init.properties) {
            if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.initializer)) continue
            const key = propKeyName(prop)
            if (key !== undefined) nsToAlias.set(prop.initializer.text, key)
          }
        }
      }
    }
    for (const [alias, spec] of aliasToFile) {
      const ns = nsToAlias.get(alias)
      if (ns !== undefined && spec.startsWith('./')) map.set(spec.slice(2, -3), ns)
    }
  } catch { /* namespace labels are best-effort */ }
  return map
}

/** Import type specifier → resolved upstream file path (or undefined). */
function resolveUpstream(fileText) {
  const sf = ts.createSourceFile('vi.ts', fileText, ts.ScriptTarget.Latest, true)
  const dirs = packageDirs()
  let lastReason = 'no upstream import type'
  for (const st of sf.statements) {
    if (!(ts.isImportDeclaration(st) || ts.isExportDeclaration(st))) continue
    if (st.moduleSpecifier === undefined || !ts.isStringLiteral(st.moduleSpecifier)) continue
    const spec = st.moduleSpecifier.text
    if (!spec.startsWith('@deepseek-ai/')) continue
    const names = []
    const nb = st.importClause?.namedBindings
    if (nb !== undefined && ts.isNamedImports(nb)) {
      for (const el of nb.elements) names.push((el.propertyName ?? el.name).text)
    }
    if (enZhNames(names) === undefined) continue
    const slash = spec.indexOf('/', '@deepseek-ai/'.length)
    if (slash < 0) continue
    const pkgName = spec.slice(0, slash)
    const subpath = spec.slice(slash + 1)
    const dir = dirs.get(pkgName)
    if (dir === undefined) { lastReason = `package ${pkgName} not found`; continue }
    const upstream = join(dir, ...subpath.split('/'))
    if (!existsSync(upstream)) { lastReason = `${pkgName}/${subpath} missing`; continue }
    return { file: upstream, names }
  }
  return { reason: lastReason }
}

/** Pair imported upstream name → {en, zh} export names. */
function enZhNames(imported) {
  for (const name of imported) {
    if (name === 'en' || name === 'zh') return { en: 'en', zh: 'zh' }
    if (name.endsWith('En')) return { en: name, zh: `${name.slice(0, -2)}Zh` }
    if (name.endsWith('Zh')) return { zh: name, en: `${name.slice(0, -2)}En` }
  }
  return undefined
}

function scan() {
  parsedCache.clear()
  const entries = []

  // A — client dictionaries.
  const viDir = join(ROOT, 'packages/client/locale-vi/src/locales')
  const nsMap = clientNamespaceMap()
  const upstreamCache = new Map()
  for (const name of readdirSync(viDir).filter(n => n.endsWith('.ts') && n !== 'index.ts').sort()) {
    const file = join(viDir, name)
    const stem = name.slice(0, -3)
    const text = readFileSync(file, 'utf8')
    const { objects } = parseLocaleFile(text)
    const viName = pickViObject(objects)
    let viRows = []
    if (viName !== undefined) viRows = dictRows(objects.get(viName), makeResolver(file))

    let enMap = new Map(), zhMap = new Map(), upstreamReason
    const up = resolveUpstream(text)
    if (up.file !== undefined) {
      const loadObjects = file => {
        let parsed = upstreamCache.get(file)
        if (parsed === undefined) {
          parsed = existsSync(file) ? parseFile(file).objects : new Map()
          upstreamCache.set(file, parsed)
        }
        return parsed
      }
      const pair = enZhNames(up.names)
      if (pair === undefined) {
        upstreamReason = `unpaired import names: ${up.names.join(', ')}`
      } else {
        // The zh counterpart may live in a sibling file (locales/en.ts + zh.ts).
        const primary = loadObjects(up.file)
        const sibling = up.file.replace(/[/\\](en|zh)(\.ts)$/, (m, lang, ext) =>
          `${sep}${lang === 'en' ? 'zh' : 'en'}${ext}`)
        const secondary = sibling === up.file ? primary : loadObjects(sibling)
        for (const [slot, exportName] of [['en', pair.en], ['zh', pair.zh]]) {
          const fromPrimary = primary.get(exportName)
          const obj = fromPrimary ?? secondary.get(exportName)
          if (obj === undefined) { upstreamReason = `missing export ${exportName}`; continue }
          const resolver = makeResolver(fromPrimary !== undefined ? up.file : sibling)
          const map = slot === 'en' ? enMap : zhMap
          for (const row of dictRows(obj, resolver)) map.set(row.key, row.value ?? UNAVAILABLE)
        }
      }
    } else upstreamReason = up.reason

    entries.push({
      id: `a:${stem}`, group: 'client', label: stem, namespace: nsMap.get(stem),
      file: relative(ROOT, file).split(sep).join('/'),
      upstream: up.file === undefined ? undefined : relative(ROOT, up.file).split(sep).join('/'),
      upstreamReason, viExport: viName,
      rows: mergeRows(enMap, zhMap, viRows.map(r => [r.key, r.value ?? UNAVAILABLE])),
    })
  }

  // B — desktop shell.
  const desktop = join(ROOT, 'apps/desktop/src/locale.ts')
  {
    const { objects } = parseLocaleFile(readFileSync(desktop, 'utf8'))
    const get = n => {
      const obj = objects.get(n)
      if (obj === undefined) return new Map()
      return new Map(dictRows(obj, makeResolver(desktop)).map(r => [r.key, r.value ?? UNAVAILABLE]))
    }
    entries.push({
      id: 'b:desktop', group: 'desktop', label: 'desktop shell', namespace: undefined,
      file: 'apps/desktop/src/locale.ts', viExport: 'vi',
      rows: mergeRows(get('en'), get('zh'), get('vi')),
    })
  }

  // C — plugin metadata locale directories.
  const localeDirs = []
  for (const top of ['apps', 'packages', 'vendor']) walk(join(ROOT, top), [top], localeDirs)
  for (const rel of localeDirs.sort()) {
    const dir = join(ROOT, rel)
    const read = n => {
      const f = join(dir, n)
      if (!existsSync(f)) return new Map()
      try {
        return new Map(jsonRows(JSON.parse(readFileSync(f, 'utf8')), [], []).map(r => [r.path, r.value]))
      } catch { return new Map() }
    }
    const enMap = read('en.json'), zhMap = read('zh.json'), viMap = read('vi.json')
    const enc = m => new Map([...m].map(([p, v]) => [JSON.stringify(p), v]))
    const rows = mergeRows(enc(enMap), enc(zhMap), [...viMap].map(([p, v]) => [JSON.stringify(p), v]))
    for (const r of rows) r.key = JSON.parse(r.key)
    entries.push({
      id: `c:${rel}`, group: 'plugin', label: rel.split('/').slice(-1)[0],
      file: rel, viExport: undefined,
      rows,
    })
  }

  const byId = new Map(entries.map(e => [e.id, e]))
  return { entries, byId }
}

/** Merge en/zh/vi maps into ordered rows: en order, then vi-only keys. */
function mergeRows(enMap, zhMap, viPairs) {
  const viMap = new Map(viPairs)
  const rows = []
  for (const [key, en] of enMap) {
    rows.push({
      key, en, zh: zhMap.get(key) ?? UNAVAILABLE,
      vi: viMap.has(key) ? viMap.get(key) : null, viOnly: false,
    })
    viMap.delete(key)
  }
  for (const [key, vi] of viMap) {
    rows.push({ key, en: UNAVAILABLE, zh: UNAVAILABLE, vi, viOnly: true })
  }
  return rows
}

// ------------------------------------------------------------------- save

export function saveTs(file, viExport, key, value, expected) {
  const text = readFileSync(file, 'utf8')
  const { objects } = parseLocaleFile(text)
  const viName = pickViObject(objects, viExport)
  if (viName === undefined) return { status: 400, body: { error: 'no vi object found' } }
  const obj = objects.get(viName)
  const rows = dictRows(obj)
  const row = rows.find(r => r.key === key)
  const eol = detectEol(text)

  if (row !== undefined) {
    const current = row.value === undefined ? null : row.value // unavailable literal treated like missing
    const comparable = row.node === null ? UNAVAILABLE : row.value
    if (comparable !== expected && !(expected === null && row.node === null)) {
      return { status: 409, body: { error: 'changed on disk, reload', current: comparable } }
    }
    if (row.node === null) return { status: 400, body: { error: 'existing value is not a string literal' } }
    const next = text.slice(0, row.node.getStart()) + emitTsString(value) + text.slice(row.node.getEnd())
    atomicWrite(file, next)
    return { status: 200, body: { ok: true } }
  }

  if (expected !== null && expected !== undefined) {
    return { status: 409, body: { error: 'key missing on disk, reload', current: null } }
  }
  // Insert a new property before the closing brace.
  const last = obj.properties.at(-1)
  const closeBrace = obj.getEnd() - 1
  const props = obj.properties
  const quotedKeys = props.filter(p => ts.isStringLiteral(p.name)).length
  const bareKeys = props.length - quotedKeys
  const isIdent = /^[A-Za-z_$][\w$]*$/.test(key)
  const keyText = bareKeys > quotedKeys && isIdent ? key : `'${key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  const lastStart = last === undefined ? obj.getStart() : last.getStart()
  const lineStart = text.lastIndexOf('\n', lastStart - 1) + 1
  const indent = text.slice(lineStart, lastStart).match(/^[ \t]*/)[0] || '  '
  const insertion = `${indent}${keyText}: ${emitTsString(value)},${eol}`
  let next = text.slice(0, closeBrace) + insertion + text.slice(closeBrace)
  if (last !== undefined) {
    const gap = text.slice(last.getEnd(), closeBrace)
    if (!gap.includes(',')) next = next.slice(0, last.getEnd()) + ',' + next.slice(last.getEnd())
  }
  atomicWrite(file, next)
  return { status: 200, body: { ok: true } }
}

export function saveJson(dir, key, value, expected) {
  if (!Array.isArray(key) || key.length === 0 || key.some(k => typeof k !== 'string')) {
    return { status: 400, body: { error: 'key must be an array of path segments' } }
  }
  const file = join(dir, 'vi.json')
  const existed = existsSync(file)
  const original = existed ? readFileSync(file, 'utf8') : ''
  let obj = {}
  if (existed) {
    try { obj = JSON.parse(original) } catch { return { status: 400, body: { error: 'vi.json is not valid JSON' } } }
  }
  const current = jsonGet(obj, key)
  const currentNorm = current === undefined ? null : current
  if (currentNorm !== expected) {
    return { status: 409, body: { error: 'changed on disk, reload', current: currentNorm } }
  }
  jsonSet(obj, key, value)
  let next = JSON.stringify(obj, null, 2)
  const eol = existed ? detectEol(original) : '\n'
  if (eol === '\r\n') next = next.replace(/\n/g, '\r\n')
  const hadFinalNewline = existed ? original.endsWith('\n') : true
  if (hadFinalNewline) next += eol
  atomicWrite(file, next)
  return { status: 200, body: { ok: true } }
}

function handleSave(body) {
  const { entries, byId } = scan()
  void entries
  const entry = byId.get(body.entryId)
  if (entry === undefined) return { status: 404, body: { error: 'unknown entry id' } }
  if (typeof body.value !== 'string') return { status: 400, body: { error: 'value must be a string' } }
  const expected = body.expected === undefined ? null : body.expected
  if (expected !== null && typeof expected !== 'string') {
    return { status: 400, body: { error: 'expected must be a string or null' } }
  }
  const key = body.key
  const row = entry.rows.find(r => JSON.stringify(r.key) === JSON.stringify(key))
  const en = row?.en
  if (body.value === '' && typeof en === 'string' && en !== '' && en !== UNAVAILABLE) {
    return { status: 400, body: { error: 'empty value not allowed while English is non-empty' } }
  }
  return entry.group === 'plugin'
    ? saveJson(join(ROOT, entry.file), key, body.value, expected)
    : saveTs(join(ROOT, entry.file), entry.viExport, key, body.value, expected)
}

// ------------------------------------------------------------------ http

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }

const portArg = process.argv.indexOf('--port')
const PORT = portArg >= 0 ? Number(process.argv[portArg + 1]) : 4319

export function start(port = PORT) {
  return createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (req.method === 'GET' && url.pathname === '/api/entries') {
    try {
      const { entries } = scan()
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ entries }))
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: String(error) }))
    }
    return
  }
  if (req.method === 'POST' && url.pathname === '/api/save') {
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', () => {
      try {
        const { status, body: payload } = handleSave(JSON.parse(body))
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(payload))
      } catch (error) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: String(error) }))
      }
    })
    return
  }
  if (req.method === 'GET') {
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
    if (/^[a-z]+\.(html|js|css)$/.test(name)) {
      const file = join(TOOL_DIR, name)
      if (existsSync(file)) {
        res.writeHead(200, { 'content-type': MIME[name.slice(name.lastIndexOf('.'))] })
        res.end(readFileSync(file))
        return
      }
    }
  }
  res.writeHead(404).end('not found')
  }).listen(port, '127.0.0.1', () => {
    console.log(`locale editor: http://127.0.0.1:${port}/`)
  })
}

const invokedAs = process.argv[1] === undefined ? '' : resolve(process.argv[1])
if (invokedAs === fileURLToPath(import.meta.url)) start()
