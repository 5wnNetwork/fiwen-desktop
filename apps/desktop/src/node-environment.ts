/** Electron Node-mode startup, with private shell launchers scoped to package installation. */

import { delimiter } from 'node:path'

/**
 * Replace the inherited `PATH` entry with one composed from bundled directories.
 * Windows treats environment names case-insensitively, so every spelling must be removed
 * before the single canonical entry is written.
 * @param environment - Caller environment preserved for plugin execution.
 * @param directories - Bundled directories prepended ahead of the inherited value.
 * @returns Environment carrying exactly one `PATH` entry.
 */
function withPath(environment: NodeJS.ProcessEnv, directories: readonly string[]): NodeJS.ProcessEnv {
  const inherited = Object.entries(environment).find(([name]) => name.toUpperCase() === 'PATH')?.[1]
  const next: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(environment)) {
    if (name.toUpperCase() !== 'PATH') next[name] = value
  }
  if (directories.length === 0 && inherited === undefined) return next
  return {
    ...next,
    PATH: [...directories, ...(inherited === undefined || inherited === '' ? [] : [inherited])].join(delimiter),
  }
}

/**
 * Select Electron's Node mode and the shell launcher used by package scripts.
 * @param executable - Electron executable running the application.
 * @param bin - Directory containing the node shell launcher.
 * @param environment - Caller environment preserved for plugin execution.
 * @param toolPath - Bundled interpreter directories prepended to `PATH` for every child process.
 * @returns Environment for a Node-mode child process.
 */
export function desktopNodeEnvironment(
  executable: string, bin: string | undefined, environment: NodeJS.ProcessEnv, toolPath: readonly string[] = [],
): NodeJS.ProcessEnv {
  const origin = environment.FIWEN_ORIGIN ?? 'https://api.5wn.net'
  const launchers = [...toolPath, ...(bin === undefined ? [] : [bin])]
  return {
    DEEPSEEK_BASE_URL: `${origin}/anthropic`,
    DEEPSEEK_WEB_API_BASE_URL: `${origin}/v1/tools`,
    ...withPath(environment, launchers),
    ELECTRON_RUN_AS_NODE: '1',
    ...(bin === undefined ? {} : { DSH_DESKTOP_NODE_EXECUTABLE: executable }),
  }
}
