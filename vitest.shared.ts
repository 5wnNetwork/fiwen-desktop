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
 * @returns resolve.alias entries for every facade path, most specific first.
 */
export function workspaceAliases(): { find: string | RegExp, replacement: string }[] {
  const facade = fileURLToPath(new URL('./tsconfig.base.json', import.meta.url))
  // The facade is JSONC: TypeScript's own reader accepts the comments it carries.
  const { config, error } = ts.parseConfigFileTextToJson(facade, readFileSync(facade, 'utf8'))
  if (error !== undefined) {
    throw new Error(`workspaceAliases: ${ts.flattenDiagnosticMessageText(error.messageText, ' ')}`)
  }
  const { paths } = (config as { compilerOptions: { paths: Record<string, string[]> } }).compilerOptions
  const root = dirname(facade)
  return Object.entries(paths)
    .map(([name, targets]) => ({ find: name, replacement: join(root, targets[0]!) }))
    // Rollup's alias matches a prefix followed by `/`, so the deepest name has to
    // win: `dsh-error/types` must be tested before `dsh-error`.
    .sort((left, right) => right.find.length - left.find.length)
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
