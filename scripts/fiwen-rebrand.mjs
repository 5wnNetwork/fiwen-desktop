/**
 * Re-apply the uniform part of the Fiwen rebrand to files that took upstream text during a sync.
 *
 * Package identities stay upstream's on purpose (`@deepseek-ai/dsh-*`, `dsh.*` manifest fields,
 * `DSH_*` environment variables, the asar `dsh/` root, `window.dsh`, `t('dsh', ...)` bin names),
 * because renaming them would fork every import and wire contract. This script rewrites only:
 * the product name (`DeepSeek Harness` -> `Fiwen`, or `Fiwen Desktop` under `apps/desktop/`),
 * Markdown/YAML prose that names the `dsh` command, and the `~/.dsh` home directory in prose.
 *
 * Code, tests, locale dictionaries and expected outputs under `apps/desktop/` were rebranded by
 * hand (for example `Fiwen 桌面端` and "© Fiwen Network"); resolve those from the fork side of a
 * merge instead of running this script on them.
 *
 * Usage: `node scripts/fiwen-rebrand.mjs [--check] <file>...`, or paths on stdin.
 * `--check` exits 1 and lists files that would change.
 */
import { readFileSync, writeFileSync } from 'node:fs'

/** Product-name rules for every rewritable file. Longer forms first. */
const PRODUCT = [
  [/DeepSeek Harness\.app/gu, 'Fiwen Desktop.app'],
  [/DeepSeek Harness\.exe/gu, 'Fiwen Desktop.exe'],
  [/\bthe DeepSeek Harness\b/gu, 'Fiwen'],
  [/\bDeepSeek Harness\b/gu, 'Fiwen'],
]

/** The desktop app names the desktop product, not the bare brand. */
const DESKTOP_PRODUCT = [[/\bDeepSeek Harness\b/gu, 'Fiwen Desktop']]

/**
 * The `dsh` command and home directory in prose. Every rule requires command or path context, so
 * package names (`dsh-foo`), manifest fields (`dsh.bundle`), and identifiers never match.
 */
const PROSE = [
  [/(?<![\w./@-])dsh(?= (?:web|plugin|--|-[a-zA-Z]|<|acp|sdk|headless|desktop|run|config|help|version)\b)/gu, 'fwnd'],
  // `dsh` alone is also the manifest field name (`a \`dsh\` field`); only the command form is renamed.
  [/`dsh`(?= (?:command|bin|CLI|launcher|shorthand|commands)\b)/gu, '`fwnd`'],
  [/(?<=the |a |The |A |Fiwen \()`dsh`(?=[ )（])(?! field)/gu, '`fwnd`'],
  [/`dsh`(?=（|\)| 命令| 可执行)/gu, '`fwnd`'],
  [/`dsh <name>`/gu, '`fwnd <name>`'],
  [/\bpnpm dsh\b/gu, 'pnpm fwnd'],
  [/(?<=[~/\w])\/\.dsh(?=[`'"/\s.,)]|$)/gmu, '/.fiwen'],
]

/** Prose files only; code identifiers and machine-checked strings are left to the merge. */
const PROSE_FILE = /\.(?:md|ya?ml|txt)$/u
/**
 * `.i18n.yaml` sidecars hold content hashes; rewriting them breaks the pairing gate. The official
 * brand package documents the upstream DeepSeek Harness brand, so its name stays accurate there.
 */
const SKIP = /\.i18n\.yaml$|^packages\/client\/ui-brand-official\//u

/**
 * Rewrite one file's text.
 * @param path - repository-relative path, used to choose the rule set.
 * @param text - original file contents.
 * @returns rebranded contents; unchanged for code and sidecar files.
 */
export function rebrand(path, text) {
  if (SKIP.test(path) || !PROSE_FILE.test(path)) return text
  const rules = [...(path.startsWith('apps/desktop/') ? DESKTOP_PRODUCT : []), ...PRODUCT, ...PROSE]
  let out = text
  for (const [pattern, replacement] of rules) out = out.replace(pattern, replacement)
  return out
}

if (import.meta.main ?? process.argv[1]?.endsWith('fiwen-rebrand.mjs')) {
  const args = process.argv.slice(2)
  const check = args[0] === '--check'
  if (check) args.shift()
  const files = args.length > 0 ? args : readFileSync(0, 'utf8').split(/\r?\n/u).filter(Boolean)
  const changed = []
  for (const file of files) {
    let before
    try {
      before = readFileSync(file, 'utf8')
    } catch (error) {
      // A listed path may have been deleted by the merge; nothing to rebrand.
      if (error.code === 'ENOENT') continue
      throw error
    }
    const after = rebrand(file.replaceAll('\\', '/'), before)
    if (after === before) continue
    changed.push(file)
    if (!check) writeFileSync(file, after)
  }
  console.log(`fiwen-rebrand: ${changed.length} file(s) ${check ? 'would change' : 'rewritten'}`)
  for (const file of changed) console.log(`  ${file}`)
  if (check && changed.length > 0) process.exit(1)
}
