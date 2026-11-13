/** Public dsh commands using the immutable runtime carried by the Desktop installation. */

import { delimiter, dirname, join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { runCli } from '@deepseek-ai/dsh/lib/bin.js'
import { primaryRuntimeToolPath } from '@deepseek-ai/dsh-tool-workspace-dependencies'
import { installOfficeEngineResolution, runtimeArchivePath } from './office-engine.ts'

/**
 * Prepend the payload's bundled interpreters to this process's `PATH`.
 * MCP stdio children and shell tools inherit it, so `uvx`, `node` and `python`
 * resolve without a system installation.
 * @param supportDir - Physical Desktop runtime directory carrying the primary-runtime payload.
 * @returns Resolves after `process.env.PATH` names each bundled interpreter directory that exists.
 */
function exposeBundledInterpreters(supportDir: string): void {
  const available = primaryRuntimeToolPath(join(supportDir, 'primary-runtime'), existsSync)
  if (available.length === 0) return
  const inherited = process.env.PATH ?? ''
  process.env.PATH = [...available, ...(inherited === '' ? [] : [inherited])].join(delimiter)
}

/**
 * Run the ordinary CLI with Desktop's bundled package manager and reserved-profile plugin access.
 * @param runtimeDir - Prepared or ASAR-contained production DSH package tree.
 * @param supportDir - Physical Desktop runtime directory containing the primary-runtime payload and Node launchers.
 * @returns Completion of the selected CLI command; profile plugins own their process lifetime.
 */
export async function runDesktopCli(runtimeDir: string, supportDir: string): Promise<void> {
  installOfficeEngineResolution(runtimeDir)
  exposeBundledInterpreters(supportDir)
  await runCli({
    manageDesktopProfile: true,
    packageManager: {
      command: process.execPath,
      args: ['--expose-internals', join(supportDir, 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs')],
      env: {
        ELECTRON_RUN_AS_NODE: '1',
        DSH_DESKTOP_NODE_EXECUTABLE: process.execPath,
        PATH: `${join(supportDir, 'bin')}${delimiter}${process.env.PATH ?? ''}`,
      },
    },
  })
}

if (import.meta.main) {
  if (process.platform === 'win32') {
    const { installWindowsCliSignals } = await import('./windows-cli-signals.ts')
    await installWindowsCliSignals()
  }
  const runtimeDir = resolve(import.meta.dirname, '../../../..')
  await runDesktopCli(runtimeDir, join(dirname(runtimeArchivePath(runtimeDir) ?? runtimeDir), 'runtime'))
}
