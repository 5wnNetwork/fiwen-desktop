import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const decoratorSyntax = /^\s*@[A-Za-z_$][\w$]*/m

/**
 * Worker arguments that keep process-wide Web Storage from shadowing jsdom storage.
 * Node lists the positive spelling in `allowedNodeEnvironmentFlags` for this negatable flag.
 */
export const vitestExecArgv = process.allowedNodeEnvironmentFlags.has('--webstorage') ? ['--no-webstorage'] : []

/**
 * Map every workspace package to its source through the tsconfig `paths` facade.
 *
 * The `vite-tsconfig-paths` plugin applies `paths` only to files it matches, so an
 * import issued from inside a workspace package could still resolve through its
 * `node_modules` link and load a built `lib/` copy. Two module instances of one
 * class break identity checks: `HarnessError` from `@deepseek-ai/dsh-error` and the
 * re-export of it from `@deepseek-ai/dsh-llm` were different constructors, so every
 * `instanceof` assertion failed. Aliasing the facade completely makes each bare
 * name resolve to one source file, which is the source plane these suites run in.
 *
 * Each entry matches its bare name exactly. A prefix match would also capture the
 * subpath imports a package declares in its own `exports` map (`./src/*`), which
 * must keep resolving through that map rather than being appended to a directory.
 * @returns resolve.alias entries for every facade path.
 */
export function workspaceAliases(): { find: RegExp, replacement: string }[] {
  const facade = fileURLToPath(new URL('./tsconfig.base.json', import.meta.url))
  // The facade is JSONC: TypeScript's own reader accepts the comments it carries.
  const { config, error } = ts.parseConfigFileTextToJson(facade, readFileSync(facade, 'utf8'))
  if (error !== undefined) {
    throw new Error(`workspaceAliases: ${ts.flattenDiagnosticMessageText(error.messageText, ' ')}`)
  }
  const { paths } = (config as { compilerOptions: { paths: Record<string, string[]> } }).compilerOptions
  const root = dirname(facade)
  return Object.entries(paths)
    // Wildcard entries keep resolving through the tsconfig-paths plugin.
    .filter(([name, targets]) => !name.includes('*') && !targets[0]!.includes('*'))
    .map(([name, targets]) => ({
      find: new RegExp(`^${name.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)}$`, 'u'),
      replacement: join(root, targets[0]!),
    }))
}

/**
 * Transform standard TypeScript decorators before Vite's default parser sees source files.
 * @returns a pre-transform Vite plugin shared by source-mode test configurations.
 */
export function standardDecoratorPlugin() {
  return {
    name: 'dsh-standard-decorators',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const file = id.split('?', 1)[0]!
      if (!/\.[cm]?tsx?$/.test(file) || !decoratorSyntax.test(code)) return
      const result = ts.transpileModule(code, {
        fileName: file,
        compilerOptions: {
          target: ts.ScriptTarget.ES2024,
          module: ts.ModuleKind.ESNext,
          jsx: file.endsWith('x') ? ts.JsxEmit.ReactJSX : undefined,
          sourceMap: true,
        },
      })
      return {
        code: result.outputText
          .replace(
            /^(\s*)(__esDecorate\()/gmu,
            '$1/* v8 ignore next -- compiler-synthetic decorator accessors have no source behavior */ $2',
          )
          .replace(/\n?\/\/# sourceMappingURL=.*$/u, '\n'),
        map: result.sourceMapText,
      }
    },
  }
}
