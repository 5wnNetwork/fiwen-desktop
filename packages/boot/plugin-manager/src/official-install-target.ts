/** Select Official bundle packages from the running installation without importing provider code. */
import { existsSync, globSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { bundlePatchPaths, type ProfileManifest } from '@deepseek-ai/dsh-app-boot'

interface WorkspaceManifest extends ProfileManifest {
  main?: string
}

function manifestAt(file: string): WorkspaceManifest {
  return JSON.parse(readFileSync(file, 'utf8')) as WorkspaceManifest
}

/**
 * The bundle's own copy inside a packaged installation, when it ships there at the running version.
 * @param name - Official catalog package name.
 * @param anchor - Resolved DSH package.json of the running installation.
 * @param version - Running DSH version the shipped copy must match.
 * @returns A link spec for the shipped copy, or undefined when the installation does not carry it.
 */
function shippedTarget(name: string, anchor: string, version: string): { spec: string; version: string } | undefined {
  const directory = join(dirname(anchor), 'node_modules', name)
  const manifest = join(directory, 'package.json')
  if (!existsSync(manifest)) return undefined
  if (manifestAt(manifest).version !== version) return undefined
  if (!existsSync(join(directory, 'lib', 'index.js'))) return undefined
  return { spec: `link:${realpathSync(directory)}`, version }
}

/**
 * Offer a source checkout link or an exact published package version. Source installations are
 * identified by the real CLI manifest and its unpacked workspace dependencies, including Desktop's
 * development symlink. An incomplete checkout is an error, never a registry fallback.
 *
 * A packaged installation that already carries the bundle links its own copy. Desktop ships the
 * on-demand bundles beside the CLI, and a private deployment publishes no registry release at its
 * running version, so the registry spec would fail with no matching version.
 * @param name - Official catalog package name.
 * @param installAnchor - Running application's DSH package.json, possibly reached through a symlink.
 * @param version - Running DSH version used by its release family.
 * @returns An ordinary package-manager spec and its package version.
 * @throws when a source installation lacks its workspace package, bundle patch, or built runtime.
 */
export function officialBundleInstallTarget(name: string, installAnchor: string, version: string): { spec: string; version: string } {
  const anchor = realpathSync(installAnchor)
  const installation = manifestAt(anchor)
  const source = installation.name === '@deepseek-ai/dsh'
    && Object.values(installation.dependencies ?? {}).some(value => value.startsWith('workspace:'))
  if (!source) return shippedTarget(name, anchor, version) ?? { spec: `${name}@${version}`, version }
  const root = resolve(dirname(anchor), '../..')
  if (anchor !== join(root, 'apps', 'cli', 'package.json')
    || !existsSync(join(root, 'package.json'))
    || manifestAt(join(root, 'package.json')).name !== '@deepseek-ai/dsh-root') {
    throw new Error(`Official bundle ${name}: source DSH installation ${anchor} requires its complete workspace checkout`)
  }
  const matches = globSync('packages/*/*/package.json', { cwd: root })
    .map(file => ({ file: join(root, file), manifest: manifestAt(join(root, file)) }))
    .filter(entry => entry.manifest.name === name)
  const selected = matches[0]
  if (matches.length !== 1 || selected === undefined) {
    throw new Error(`Official bundle ${name}: expected one workspace package in ${root}, found ${matches.length}; restore the checkout and run pnpm install`)
  }
  const { file, manifest } = selected
  const directory = realpathSync(dirname(file))
  if (manifest.version !== version || manifest.private === true || manifest.dsh?.bundle === undefined) {
    throw new Error(`Official bundle ${name}: ${file} must declare a public bundle at DSH version ${version}`)
  }
  const main = typeof manifest.main === 'string' ? resolve(directory, manifest.main) : undefined
  if (main === undefined || !existsSync(main) || !statSync(main).isFile()) {
    throw new Error(`Official bundle ${name}: built runtime is missing in ${directory}; run pnpm install and pnpm run build in ${root}`)
  }
  for (const patch of bundlePatchPaths(directory, manifest.dsh.bundle)) {
    if (!existsSync(patch) || !statSync(patch).isFile()) {
      throw new Error(`Official bundle ${name}: bundle patch ${patch} is missing; restore the checkout`)
    }
  }
  return { spec: `link:${directory}`, version }
}
