/** Local install ledger and artifact writes for the Fiwen marketplace. */
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { isMap, isSeq, parseDocument, type YAMLSeq } from 'yaml'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import type { ProfileContext } from '@deepseek-ai/dsh-app-boot'
import type { McpPayload, SkillPayload } from './wire.ts'
import type { MarketInstalledView, MarketItemKind } from './types.ts'

/** File inside an installed skill directory recording provenance; its presence marks a market install. */
const MARKER = '.fiwen-market.json'
/** Patch row id prefix for market-installed MCP servers. */
const MCP_ROW_PREFIX = 'market-'
/** Local ledger of every market install this machine made. */
const LEDGER = 'installs.json'

interface LedgerFile {
  readonly version: 1
  readonly installs: Readonly<Record<string, { kind: MarketItemKind; version: string; installedAt: string }>>
}

export interface MarketStoreLayout {
  /** `<dshHome>/skills` — user-level skill root the filesystem provider already scans. */
  readonly skillsDir: string
  /** `<dshHome>/market` — ledger and scratch space owned by this service. */
  readonly marketDir: string
}

async function readLedger(marketDir: string): Promise<LedgerFile> {
  try {
    const parsed = JSON.parse(await readFile(join(marketDir, LEDGER), 'utf8')) as { version?: number; installs?: unknown } | null
    if (parsed?.version !== 1 || typeof parsed.installs !== 'object' || parsed.installs === null) return { version: 1, installs: {} }
    return { version: 1, installs: parsed.installs as LedgerFile['installs'] }
  } catch {
    return { version: 1, installs: {} }
  }
}

async function writeLedger(marketDir: string, ledger: LedgerFile): Promise<void> {
  await writeFileAtomic(join(marketDir, LEDGER), JSON.stringify(ledger, null, 2), { mode: 0o600 })
}

/** Skills this directory owns for the market, keyed on the marker file's recorded id. */
async function readMarker(dir: string): Promise<{ id: string; version: string } | undefined> {
  try {
    const parsed = JSON.parse(await readFile(join(dir, MARKER), 'utf8')) as { id?: string; version?: string } | null
    return typeof parsed?.id === 'string' && typeof parsed.version === 'string' ? { id: parsed.id, version: parsed.version } : undefined
  } catch {
    return undefined
  }
}

/**
 * Whether a directory in the skill root may be replaced: it is a market install (marker present)
 * or it does not exist at all. A user-owned directory is a conflict.
 */
async function skillDirAvailable(dir: string): Promise<boolean> {
  if (await readMarker(dir) !== undefined) return true
  try {
    await readdir(dir)
    return false
  } catch {
    return true
  }
}

/** MCP row ids currently inserted by the market across the profile patch file. */
export async function marketPatchIds(patchPath: string): Promise<Set<string>> {
  const ids = new Set<string>()
  let text: string
  try {
    text = await readFile(patchPath, 'utf8')
  } catch {
    return ids
  }
  const document = parseDocument(text, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (value: string) => value }] })
  if (!isSeq(document.contents)) return ids
  const items = document.contents.items
  for (let index = 0; index < items.length; index++) {
    const item = items[index]
    if (!isMap(item) || !item.has('insert')) continue
    const insert = item.get('insert')
    if (!isSeq(insert)) continue
    for (let rowIndex = 0; rowIndex < insert.items.length; rowIndex++) {
      const id = document.getIn([index, 'insert', rowIndex, 'id'])
      if (typeof id === 'string' && id.startsWith(MCP_ROW_PREFIX)) ids.add(id.slice(MCP_ROW_PREFIX.length))
    }
  }
  return ids
}

/** Read the reconciled install list: ledger entries whose artifact still exists. */
export async function listInstalled(layout: MarketStoreLayout, patchPath: string | undefined): Promise<readonly MarketInstalledView[]> {
  const ledger = await readLedger(layout.marketDir)
  const patchIds = patchPath === undefined ? new Set<string>() : await marketPatchIds(patchPath)
  const out: MarketInstalledView[] = []
  const stale: string[] = []
  for (const [id, entry] of Object.entries(ledger.installs)) {
    const present = entry.kind === 'skill'
      ? (await readMarker(join(layout.skillsDir, id)))?.id === id
      : patchIds.has(id)
    if (present) out.push({ id, kind: entry.kind, version: entry.version, installedAt: entry.installedAt })
    else stale.push(id)
  }
  if (stale.length > 0) {
    const staleSet = new Set(stale)
    const next = Object.fromEntries(Object.entries(ledger.installs).filter(([id]) => !staleSet.has(id)))
    await writeLedger(layout.marketDir, { version: 1, installs: next }).catch(() => undefined)
  }
  return out
}

/**
 * Extract a skill payload under `<skillsDir>/<id>`: stage to a sibling, replace the existing
 * market-owned directory atomically, and stamp the marker.
 * @returns the ledger entry written, or throws.
 */
export async function installSkill(
  layout: MarketStoreLayout, id: string, version: string, payload: SkillPayload,
): Promise<MarketInstalledView> {
  const dir = join(layout.skillsDir, id)
  if (!(await skillDirAvailable(dir))) {
    throw new Error('skill-dir')
  }
  const staging = `${dir}.${randomBytes(4).toString('hex')}.tmp`
  try {
    await mkdir(staging, { recursive: true })
    for (const file of payload.files) {
      const target = join(staging, ...file.path.split('/'))
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : file.content,
        file.encoding === 'base64' ? undefined : 'utf8')
    }
    const installedAt = new Date().toISOString()
    await writeFile(join(staging, MARKER), JSON.stringify({ id, version, installedAt }), 'utf8')
    await rm(dir, { recursive: true, force: true })
    await rename(staging, dir)
    const ledger = await readLedger(layout.marketDir)
    await writeLedger(layout.marketDir, {
      version: 1,
      installs: { ...ledger.installs, [id]: { kind: 'skill', version, installedAt } },
    })
    return { id, kind: 'skill', version, installedAt }
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

/** Remove a market-installed skill directory; a user-owned directory is left untouched. */
export async function uninstallSkill(layout: MarketStoreLayout, id: string): Promise<boolean> {
  const dir = join(layout.skillsDir, id)
  if ((await readMarker(dir))?.id !== id) return false
  await rm(dir, { recursive: true, force: true })
  const ledger = await readLedger(layout.marketDir)
  if (ledger.installs[id] !== undefined) {
    const { [id]: _removed, ...next } = ledger.installs
    await writeLedger(layout.marketDir, { version: 1, installs: next })
  }
  return true
}

/** The cordis.patch.yml row an MCP payload becomes; `serverName` carries the item slug. */
export function mcpRowConfig(id: string, payload: McpPayload): Record<string, unknown> {
  if (payload.transport === 'stdio') {
    return {
      transport: 'stdio',
      serverName: id,
      command: payload.command,
      ...(payload.args === undefined ? {} : { args: payload.args }),
      ...(payload.env === undefined || Object.keys(payload.env).length === 0 ? {} : { env: payload.env }),
    }
  }
  return {
    transport: 'streamable-http',
    serverName: id,
    url: payload.url,
    ...(payload.headers === undefined || Object.keys(payload.headers).length === 0 ? {} : { headers: payload.headers }),
  }
}

/**
 * Insert or replace the `market-<id>` mcp-client row in the profile patch file.
 * @param profile - running profile context; `patchPath` receives the edit.
 */
export async function installMcp(
  profile: ProfileContext, id: string, version: string, payload: McpPayload, layout: MarketStoreLayout,
): Promise<MarketInstalledView> {
  const filename = profile.patchPath
  let text: string
  try {
    text = await readFile(filename, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    text = '[]\n'
  }
  const document = parseDocument(text, {
    customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (value: string) => value }],
  })
  const error = document.errors[0]
  if (error !== undefined) throw error
  if (!isSeq(document.contents)) throw new Error('Profile patch must be a YAML sequence')
  const rowId = `${MCP_ROW_PREFIX}${id}`
  // Drop any prior market row for this item so an update replaces rather than duplicates.
  removePatchRow(document, document.contents, rowId)
  document.add({ insert: [{ id: rowId, name: '@deepseek-ai/dsh-mcp-client', config: mcpRowConfig(id, payload) }] })
  await writeFileAtomic(filename, String(document), { mode: 0o600 })
  const installedAt = new Date().toISOString()
  const ledger = await readLedger(layout.marketDir)
  await writeLedger(layout.marketDir, {
    version: 1,
    installs: { ...ledger.installs, [id]: { kind: 'mcp', version, installedAt } },
  })
  return { id, kind: 'mcp', version, installedAt }
}

/** Remove `market-<id>` from `seq`; also removes the enclosing insert item when it empties. */
function removePatchRow(document: ReturnType<typeof parseDocument>, seq: YAMLSeq, rowId: string): boolean {
  const items = seq.items
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]
    if (!isMap(item) || !item.has('insert')) continue
    const insert = item.get('insert')
    if (!isSeq(insert)) continue
    for (let rowIndex = insert.items.length - 1; rowIndex >= 0; rowIndex--) {
      if (document.getIn([index, 'insert', rowIndex, 'id']) === rowId) {
        insert.items.splice(rowIndex, 1)
        if (insert.items.length === 0) items.splice(index, 1)
        return true
      }
    }
  }
  return false
}

/** Remove a market-installed MCP row; no-op when absent. */
export async function uninstallMcp(profile: ProfileContext, id: string, layout: MarketStoreLayout): Promise<boolean> {
  const filename = profile.patchPath
  const text = await readFile(filename, 'utf8').catch(() => undefined)
  if (text === undefined) return false
  const document = parseDocument(text, {
    customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (value: string) => value }],
  })
  if (document.errors[0] !== undefined || !isSeq(document.contents)) return false
  const removed = removePatchRow(document, document.contents, `${MCP_ROW_PREFIX}${id}`)
  if (removed) await writeFileAtomic(filename, String(document), { mode: 0o600 })
  const ledger = await readLedger(layout.marketDir)
  if (ledger.installs[id] !== undefined) {
    const { [id]: _removed, ...next } = ledger.installs
    await writeLedger(layout.marketDir, { version: 1, installs: next })
  }
  return removed
}
