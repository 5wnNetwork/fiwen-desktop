/** Wire parsers for the Fiwen marketplace endpoints; every read validates at the boundary. */
import type { MarketCategoryView, MarketItemDetail, MarketItemKind, MarketItemView, MarketText } from './types.ts'

/** A malformed backend body; `path` and `reason` describe the first violated rule. */
export class MarketWireError extends Error {
  readonly path: string
  readonly reason: string

  constructor(path: string, reason: string) {
    super(`market response ${path}: ${reason}`)
    this.name = 'MarketWireError'
    this.path = path
    this.reason = reason
  }
}

const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/u
const MAX_SKILL_FILES = 200
const MAX_SKILL_FILE_BYTES = 1024 * 1024

type Json = Record<string, unknown>

function fail(path: string, reason: string): never {
  throw new MarketWireError(path, reason)
}

function objectAt(value: unknown, path: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'must be an object')
  return value as Json
}

function stringAt(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(path, 'must be a non-empty string')
  return value
}

function numberAt(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'must be a finite number')
  return value
}

function nullable(object: Json, key: string, path: string): string | null {
  const value = object[key]
  if (value === null || value === undefined) return null
  return stringAt(value, `${path}.${key}`)
}

function textAt(value: unknown, path: string): MarketText {
  const object = objectAt(value, path)
  return {
    en: stringAt(object.en, `${path}.en`),
    vi: stringAt(object.vi, `${path}.vi`),
    zh: stringAt(object.zh, `${path}.zh`),
  }
}

function kindAt(value: unknown, path: string): MarketItemKind {
  if (value !== 'skill' && value !== 'mcp') fail(path, 'must be "skill" or "mcp"')
  return value
}

function itemBase(object: Json, path: string) {
  return {
    id: stringAt(object.id, `${path}.id`),
    kind: kindAt(object.kind, `${path}.kind`),
    categoryId: nullable(object, 'categoryId', path),
    title: textAt(object.title, `${path}.title`),
    summary: textAt(object.summary, `${path}.summary`),
    icon: nullable(object, 'icon', path),
    author: nullable(object, 'author', path),
    homepage: nullable(object, 'homepage', path),
    version: stringAt(object.version, `${path}.version`),
    downloads: numberAt(object.downloads, `${path}.downloads`),
    uniqueDownloads: numberAt(object.uniqueDownloads, `${path}.uniqueDownloads`),
    updatedAt: stringAt(object.updatedAt, `${path}.updatedAt`),
  }
}

/** A marketplace skill file: relative POSIX path and content the install writes verbatim. */
export interface SkillFile {
  readonly path: string
  readonly content: string
  readonly encoding?: 'utf8' | 'base64'
}

export interface SkillPayload {
  readonly files: readonly SkillFile[]
}

/** The install payload of one MCP item as the backend serves it. */
export type McpPayload =
  | { readonly transport: 'stdio'; readonly command: string; readonly args?: readonly string[]; readonly env?: Readonly<Record<string, string>> }
  | { readonly transport: 'http'; readonly url: string; readonly headers?: Readonly<Record<string, string>> }

/**
 * Whether a served skill path stays inside its install directory: relative POSIX separators only,
 * no `.`/`..` segments, backslashes, drive letters, or NUL.
 */
export function safeSkillPath(path: string): boolean {
  if (path === '' || path.startsWith('/') || path.includes('\\') || path.includes(':')) return false
  return path.split('/').every(seg => seg !== '' && seg !== '.' && seg !== '..' && !seg.includes('\0'))
}

function stringDictAt(value: unknown, path: string): Record<string, string> | undefined {
  if (value === undefined) return undefined
  const object = objectAt(value, path)
  const dict: Record<string, string> = {}
  for (const [key, member] of Object.entries(object)) dict[key] = stringAt(member, `${path}.${key}`)
  return dict
}

function skillPayloadAt(value: unknown, path: string): SkillPayload {
  const object = objectAt(value, path)
  if (!Array.isArray(object.files)) fail(`${path}.files`, 'must be an array')
  if (object.files.length === 0 || object.files.length > MAX_SKILL_FILES) {
    fail(`${path}.files`, `must hold 1..${MAX_SKILL_FILES} files`)
  }
  const files = object.files.map((entry, index): SkillFile => {
    const file = objectAt(entry, `${path}.files[${index}]`)
    const filePath = stringAt(file.path, `${path}.files[${index}].path`)
    if (!safeSkillPath(filePath)) fail(`${path}.files[${index}].path`, 'is not a safe relative path')
    const content = file.content
    if (typeof content !== 'string') fail(`${path}.files[${index}].content`, 'must be a string')
    if (content.length > MAX_SKILL_FILE_BYTES) fail(`${path}.files[${index}].content`, 'exceeds the size limit')
    const encoding = file.encoding
    if (encoding !== undefined && encoding !== 'utf8' && encoding !== 'base64') {
      fail(`${path}.files[${index}].encoding`, 'must be "utf8" or "base64"')
    }
    return encoding === undefined ? { path: filePath, content } : { path: filePath, content, encoding }
  })
  return { files }
}

function mcpPayloadAt(value: unknown, path: string): McpPayload {
  const object = objectAt(value, path)
  const transport = object.transport
  if (transport === 'stdio') {
    const args = object.args
    if (args !== undefined && (!Array.isArray(args) || args.some(a => typeof a !== 'string'))) {
      fail(`${path}.args`, 'must be an array of strings')
    }
    const env = stringDictAt(object.env, `${path}.env`)
    return {
      transport: 'stdio',
      command: stringAt(object.command, `${path}.command`),
      ...(args === undefined ? {} : { args: args as string[] }),
      ...(env === undefined ? {} : { env }),
    }
  }
  if (transport === 'http') {
    const headers = stringDictAt(object.headers, `${path}.headers`)
    return { transport: 'http', url: stringAt(object.url, `${path}.url`), ...(headers === undefined ? {} : { headers }) }
  }
  fail(`${path}.transport`, 'must be "stdio" or "http"')
}

export interface MarketItemList {
  readonly items: readonly MarketItemView[]
  readonly total: number
}

/** Parse or throw `MarketWireError`; the caller maps the failure to `market/invalid-response`. */
export function parseList(body: unknown): MarketItemList {
  const object = objectAt(body, '$')
  if (!Array.isArray(object.items)) fail('$.items', 'must be an array')
  const items = object.items.map((entry, index) => itemBase(objectAt(entry, `$.items[${index}]`), `$.items[${index}]`))
  return { items, total: numberAt(object.total, '$.total') }
}

export function parseCategories(body: unknown): readonly MarketCategoryView[] {
  const object = objectAt(body, '$')
  if (!Array.isArray(object.categories)) fail('$.categories', 'must be an array')
  return object.categories.map((entry, index): MarketCategoryView => {
    const path = `$.categories[${index}]`
    const category = objectAt(entry, path)
    return {
      id: stringAt(category.id, `${path}.id`),
      title: textAt(category.title, `${path}.title`),
      sortOrder: numberAt(category.sortOrder, `${path}.sortOrder`),
    }
  })
}

export function parseDetail(body: unknown): MarketItemDetail {
  const object = objectAt(body, '$')
  const item = objectAt(object.item, '$.item')
  const description = item.description
  return {
    ...itemBase(item, '$.item'),
    description: description === null || description === undefined ? null : textAt(description, '$.item.description'),
  }
}

export interface InstallResult {
  readonly id: string
  readonly kind: MarketItemKind
  readonly version: string
  readonly name: string
  readonly payload: SkillPayload | McpPayload
}

export function parseInstall(body: unknown): InstallResult {
  const object = objectAt(body, '$')
  const item = objectAt(object.item, '$.item')
  const id = stringAt(item.id, '$.item.id')
  if (!SLUG.test(id)) fail('$.item.id', 'is not a slug')
  const kind = kindAt(item.kind, '$.item.kind')
  const base = { id, version: stringAt(item.version, '$.item.version'), name: stringAt(item.name, '$.item.name') }
  if (kind === 'skill') return { ...base, kind, payload: skillPayloadAt(item.payload, '$.item.payload') }
  return { ...base, kind, payload: mcpPayloadAt(item.payload, '$.item.payload') }
}
