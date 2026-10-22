/** Marketplace installs through the profile's real Loader: patch rows mount and retract. */
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Service, type Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { boot, initProfile, readProfilePatches, recomposeProfile, type ProfileContext } from '@deepseek-ai/dsh-app-boot'
import Market from '../src/index.ts'

const ORIGIN = 'http://market.test'

/** `deepseekAccount` double issuing a fixed token for the test origin. */
class StubAccount extends Service {
  constructor(ctx: Context) { super(ctx, 'deepseekAccount') }
  resolveToken(url: string) { return Promise.resolve(url === ORIGIN ? 'tok' : undefined) }
}

/** Server names the stub mcp-client package has mounted, written through `globalThis` across module instances. */
function mounts(): string[] {
  return (globalThis as { __dshMarketTestMounts?: string[] }).__dshMarketTestMounts ??= []
}

/** The stub `@deepseek-ai/dsh-mcp-client` the test profile resolves; records each mount's serverName. */
const STUB_MCP = `export default class McpClient {
  constructor(ctx, config) {
    ;(globalThis.__dshMarketTestMounts ??= []).push(config.serverName ?? 'none')
  }
}
`

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete (globalThis as { __dshMarketTestMounts?: string[] }).__dshMarketTestMounts
})

it('mounts through a bundle patch, installs an MCP row the Loader picks up, and retracts on uninstall', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-market-configuration-')))
  let ctx: Awaited<ReturnType<typeof boot>> | undefined
  try {
    const dir = join(home, 'profiles', 'test')
    initProfile(dir, ['test-bundle'])
    const bundle = join(dir, 'node_modules', 'test-bundle')
    mkdirSync(bundle, { recursive: true })
    writeFileSync(join(bundle, 'package.json'), JSON.stringify({ name: 'test-bundle', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } } }))
    writeFileSync(join(bundle, 'cordis.patch.yml'), readFileSync(new URL('./fixtures/market.patch.yml', import.meta.url)))
    const stubMcp = join(dir, 'node_modules', '@deepseek-ai', 'dsh-mcp-client')
    mkdirSync(stubMcp, { recursive: true })
    writeFileSync(join(stubMcp, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-mcp-client', version: '0.0.0', type: 'module', main: 'index.js' }))
    writeFileSync(join(stubMcp, 'index.js'), STUB_MCP)
    writeFileSync(join(dir, 'cordis.yml'), '[]\n')
    const profile: ProfileContext = {
      name: 'test', startedBundles: ['test-bundle'], dir, patchPath: join(dir, 'cordis.patch.yml'),
      installAnchor: join(dir, 'package.json'), cwd: home, home, overlays: [], telemetryDisabledEnv: undefined,
    }
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json({
      item: { id: 'notes', kind: 'mcp', version: '1.0.0', name: 'Notes', payload: { transport: 'http', url: 'https://m.example/mcp' } },
    }))))
    ctx = await boot('test', join(dir, 'cordis.yml'), readProfilePatches('test', profile), (root) => {
      root.provide('profileContext', profile)
      Object.assign(root.loader.builtins, { account: StubAccount, market: Market })
    })
    const market = ctx.get('market')!
    expect(market).toBeInstanceOf(Market)
    expect(mounts()).toEqual(['base'])
    await market.installItem('notes')
    expect(readFileSync(profile.patchPath, 'utf8')).toContain('id: market-notes')
    // The same path HMR runs after its patch-file watch fires.
    await recomposeProfile(ctx, readProfilePatches('test', profile), 'test')
    await vi.waitFor(() => { expect(mounts()).toContain('notes') })
    await market.uninstallItem('notes')
    expect(readFileSync(profile.patchPath, 'utf8')).not.toContain('market-notes')
  } finally {
    try { await ctx?.fiber.dispose() } finally { rmSync(home, { recursive: true, force: true }) }
  }
})
