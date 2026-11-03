/** Wire parsers for the Fiwen marketplace endpoints; every read validates at the boundary. */
import type { MarketCategoryView, MarketItemDetail, MarketItemKind, MarketItemView, MarketText } from './types.ts'

/** A malformed backend body; `path` and `reason` describe the first violated rule. */
export class MarketWireError extends Error {
  /** JSON path of the first violated rule. */
  readonly path: string
  /** Why the value at {@link path} was rejected. */
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

/**
 * Environment keys that change interpreter or loader behavior. Their values
 * are hidden from the install review, so accepting them would let a catalog
 * execute code without the command line showing it.
 */
const BLOCKED_ENV_KEYS = new Set([
  'NODE_OPTIONS', 'NODE_PATH',
  'LD_PRELOAD', 'LD_LIBRARY_PATH', 'LD_AUDIT',
  'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH', 'DYLD_FRAMEWORK_PATH',
  'PYTHONSTARTUP', 'PYTHONHOME', 'PYTHONPATH',
  'PERL5OPT', 'RUBYOPT', 'BASH_ENV', 'ENV', 'SHELLOPTS',
  'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_EXEC_PATH',
  'NPM_CONFIG_USERCONFIG', 'NPM_CONFIG_GLOBALCONFIG', 'SSH_ASKPASS',
])

type Json = Record<string, unknown>

function fail(path: string, reason: string): never {
  throw new MarketWireError(path, reason)
}

/** A typed field reader: the narrowing predicate and the reason a value that fails it is refused. */
function reader<T>(accept: (value: unknown) => value is T, reason: string): (value: unknown, path: string) => T {
  return (value, path) => (accept(value) ? value : fail(path, reason))
}

const objectAt = reader(
  (value): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value), 'must be an object',
)
const stringAt = reader((value): value is string => typeof value === 'string' && value.trim() !== '', 'must be a non-empty string')
const numberAt = reader((value): value is number => typeof value === 'number' && Number.isFinite(value), 'must be a finite number')

function homepage(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try { return new URL(value).protocol === 'https:' ? value : null } catch { return null }
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
    homepage: homepage(object.homepage),
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

/** The install payload of one skill item as the backend serves it. */
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
 * @param path - skill-relative file path received from the market endpoint.
 * @returns whether `path` is safe to extract under an install directory.
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
    if (env !== undefined) {
      for (const key of Object.keys(env)) {
        if (BLOCKED_ENV_KEYS.has(key.toUpperCase())) {
          fail(`${path}.env.${key}`, 'is not an allowed environment variable name')
        }
      }
    }
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

/** One page of the catalog listing response. */
export interface MarketItemList {
  readonly items: readonly MarketItemView[]
  readonly total: number
}

/**
 * Parse or throw `MarketWireError`; the caller maps the failure to `market/invalid-response`.
 * @param body - decoded JSON of the catalog listing response.
 * @returns the validated item list.
 */
export function parseList(body: unknown): MarketItemList {
  const object = objectAt(body, '$')
  if (!Array.isArray(object.items)) fail('$.items', 'must be an array')
  const items = object.items.map((entry, index) => itemBase(objectAt(entry, `$.items[${index}]`), `$.items[${index}]`))
  return { items, total: numberAt(object.total, '$.total') }
}

/**
 * Parse or throw `MarketWireError`; the caller maps the failure to `market/invalid-response`.
 * @param body - decoded JSON of the categories response.
 * @returns the validated categories in served order.
 */
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

/**
 * Parse or throw `MarketWireError`; the caller maps the failure to `market/invalid-response`.
 * @param body - decoded JSON of the item detail response.
 * @returns the validated item detail.
 */
export function parseDetail(body: unknown): MarketItemDetail {
  const object = objectAt(body, '$')
  const item = objectAt(object.item, '$.item')
  const description = item.description
  return {
    ...itemBase(item, '$.item'),
    description: description === null || description === undefined ? null : textAt(description, '$.item.description'),
  }
}

/** The install payload response of one catalog item, kind-discriminated. */
export interface InstallResult {
  readonly id: string
  readonly kind: MarketItemKind
  readonly version: string
  readonly name: string
  readonly payload: SkillPayload | McpPayload
}

/**
 * Parse or throw `MarketWireError`; the caller maps the failure to `market/invalid-response`.
 * @param body - decoded JSON of the install payload response.
 * @returns the validated install payload.
 */
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
