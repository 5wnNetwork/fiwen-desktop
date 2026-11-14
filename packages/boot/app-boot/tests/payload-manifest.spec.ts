/**
 * A dependency the packaging moved into an optional payload resolves as absent instead of
 * failing the boot. Electron answers a probe inside app.asar from the archive index, so the
 * package still probes as present and only the manifest read fails; these cases reproduce
 * that split without an Electron runtime, and prove a genuine read failure still stops boot.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

/** The package the Desktop installer ships as the `office-kit` optional payload. */
const PAYLOAD_PACKAGE = '@deepseek-ai/libreoffice-kit-win32-x64'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    readFileSync: vi.fn((...args: Parameters<typeof actual.readFileSync>) => {
      // Normalize the separator so the check matches the package name on every platform.
      const target = String(args[0]).split('\\').join('/')
      // The archive index still lists the manifest; the split removed it from disk.
      if (target.endsWith(`${PAYLOAD_PACKAGE}/package.json`)) {
        throw Object.assign(new Error(`ENOENT: no such file or directory, open '${target}'`), { code: 'ENOENT' })
      }
      return actual.readFileSync(...args)
    }),
  }
})

const roots: string[] = []
afterEach(() => {
  vi.clearAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/**
 * Write one package manifest and a module entry beside it.
 * @param dir - Package directory to create.
 * @param name - Package name recorded in the manifest.
 * @param dependencies - Dependency names the package declares.
 * @returns Absolute path of the written manifest.
 */
function pkg(dir: string, name: string, dependencies: Record<string, string> = {}): string {
  mkdirSync(dir, { recursive: true })
  const manifest = join(dir, 'package.json')
  writeFileSync(manifest, JSON.stringify({ name, version: '1.0.0', type: 'module', dependencies }))
  writeFileSync(join(dir, 'index.js'), `export const name = ${JSON.stringify(name)}\n`)
  return manifest
}

/**
 * Build an installation whose wrapper package depends on the payload package.
 * @returns The root directory and the manifest of the running package.
 */
function fixture(): { root: string; installAnchor: string } {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-payload-manifest-')))
  roots.push(root)
  const modules = join(root, 'global', 'node_modules', '@deepseek-ai')
  const installDir = join(modules, 'dsh')
  const installAnchor = pkg(installDir, '@deepseek-ai/dsh', { '@deepseek-ai/libreoffice-kit': '*' })
  const wrapper = join(installDir, 'node_modules', '@deepseek-ai', 'libreoffice-kit')
  pkg(wrapper, '@deepseek-ai/libreoffice-kit', { [PAYLOAD_PACKAGE]: '*' })
  pkg(join(wrapper, 'node_modules', '@deepseek-ai', 'libreoffice-kit-win32-x64'), PAYLOAD_PACKAGE)
  return { root, installAnchor }
}

/**
 * Read the installation-scope package names from one resolution.
 * @param installAnchor - Manifest of the running package.
 * @param root - Harness home.
 * @returns Names the resolution supplies to every profile.
 */
async function installationNames(installAnchor: string, root: string): Promise<string[]> {
  const { createRuntimeResolution } = await import('../src/profile.ts')
  const resolution = await createRuntimeResolution({ installAnchor, home: root })
  return resolution.entries.filter(entry => entry.scope === 'installation').map(entry => entry.name)
}

it('keeps booting when an optional payload left a dependency manifest unreadable', async () => {
  const { root, installAnchor } = fixture()
  const names = await installationNames(installAnchor, root)
  expect(names).toContain('@deepseek-ai/libreoffice-kit')
  expect(names).not.toContain(PAYLOAD_PACKAGE)
})

it('still fails the boot when a manifest exists but cannot be parsed', async () => {
  const { root, installAnchor } = fixture()
  const broken = join(dirname(installAnchor), 'node_modules', '@deepseek-ai', 'libreoffice-kit', 'package.json')
  writeFileSync(broken, '{not json')
  await expect(installationNames(installAnchor, root)).rejects.toThrow(SyntaxError)
})
