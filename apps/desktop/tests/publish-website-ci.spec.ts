import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import * as desktopS3 from '../scripts/desktop-s3.ts'
import { answer, s3Error, startS3Loopback } from './s3-loopback.ts'
import { publishWebsiteCi, websiteApproval } from '../scripts/publish-website-ci.ts'

afterEach(() => vi.restoreAllMocks())

it.each(['wrong-journal', 'upload', 'put', 'uploaded', 'metadata', 'metadata-retry', 'stable', 'approval'] as const)('preserves publication recovery for %s', async (scenario) => {
  const root = await mkdtemp(join(tmpdir(), 'website-ci-'))
  try {
    const config = join(root, 'packaging')
    const records = join(root, 'upload-records', 'website-99-mac-arm64')
    await mkdir(join(config, 'publishing'), { recursive: true })
    await mkdir(join(root, 'releases', '12', '1'), { recursive: true })
    await mkdir(records, { recursive: true })
    const credentialsFile = join(root, 'credentials.json')
    await writeFile(credentialsFile, JSON.stringify({ accessKeyId: 'fixture-id', secretAccessKey: 'fixture-key' }))
    await writeFile(join(config, 'publishing', 'production.json'), JSON.stringify({
      bucket: 'production-123', endpoint: 'https://s3.example.com', region: 'us-east-1', origin: 'https://desktop.5wn.net', credentialsFile,
      githubApp: { clientId: 'app', privateKeyFile: join(root, 'app.pem') },
    }))
    const route = { runId: '12', attempt: '1', commit: 'a'.repeat(40), sourceRef: 'master', channel: scenario === 'stable' ? 'stable' : 'nightly',
      runnerName: 'mini', runnerLabel: 'dsh-mini', target: 'mac-arm64', preset: 'production' }
    const manifest = { schemaVersion: 1, source: { repository: 'owner/repo', runId: '12', attempt: '1', commit: route.commit,
      workflowCommit: route.commit, sourceRef: 'master', channel: route.channel, runnerName: 'mini', target: 'mac-arm64',
      preset: 'production', productVersion: '1.0.0', version: '1.0.0', testReleaseId: null, qualification: 'notarized' },
    files: [{ name: 'fiwen-desktop-1.0.0-mac-arm64.dmg', size: 1, sha512: createHash('sha512').update('x').digest('base64') }] }
    await writeFile(join(root, 'releases', '12', '1', 'manifest.json'), JSON.stringify(manifest))
    await writeFile(join(root, 'releases', '12', '1', manifest.files[0]!.name), 'x')
    const approval = websiteApproval(manifest, 'production-123')
    await writeFile(join(records, 'state.json'), JSON.stringify({ approval, upload: 'uploaded' }))
    if (scenario === 'upload' || scenario === 'put') await rm(join(records, 'state.json'))
    if (scenario === 'metadata-retry') await writeFile(join(records, 'state.json'), JSON.stringify({ approval, upload: 'upload-intent', uploadConfirmed: true }))
    if (scenario === 'wrong-journal') await writeFile(join(records, 'state.json'), JSON.stringify({ approval: 'other', upload: 'upload-intent' }))
    const env = { RUNNER_NAME: 'mini', GITHUB_REPOSITORY: 'owner/repo', GITHUB_RUN_ID: '99',
      GITHUB_RUN_ATTEMPT: '1', DSH_PACKAGING_CONFIG_DIR: config, DESKTOP_PUBLISH_ROUTE: JSON.stringify(route),
      DESKTOP_WEBSITE_APPROVAL: approval, GITHUB_OUTPUT: join(root, 'output') }
    let stored = scenario !== 'put' && scenario !== 'upload'
    let headerStored = scenario !== 'metadata'
    const server = await startS3Loopback(async (request, response) => {
      if (request.method === 'PUT') {
        expect(request.body.toString()).toBe('x')
        if (scenario === 'metadata') {
          expect(JSON.parse(await readFile(join(records, 'state.json'), 'utf8'))).toMatchObject({ upload: 'upload-intent', uploadConfirmed: true })
        }
        expect(request.headers['if-none-match']).toBeUndefined()
        expect(request.headers['content-disposition']).toBe(`attachment; filename="${manifest.files[0]!.name}"`)
        stored = true
        headerStored = true
        answer(response)
        return
      }
      if (!stored) answer(response, 404, s3Error('NoSuchKey'), { 'content-type': 'application/xml' })
      else answer(response, 200, scenario === 'metadata-retry' ? 'y' : 'x',
        headerStored ? { 'content-disposition': `attachment; filename="${manifest.files[0]!.name}"` } : {})
    })
    const original = desktopS3.createDesktopS3
    vi.spyOn(desktopS3, 'createDesktopS3').mockImplementation((credentials, timeoutMs) => {
      expect(credentials).toMatchObject({ accessKeyId: 'fixture-id', endpoint: 'https://s3.example.com' })
      return original({ ...credentials, endpoint: server.credentials.endpoint }, timeoutMs)
    })
    try {
      if (scenario === 'wrong-journal') {
        await expect(publishWebsiteCi(env)).rejects.toThrow('journal belongs to another approved build')
        expect(server.requests).toHaveLength(0)
      } else if (scenario === 'metadata-retry') {
        await expect(publishWebsiteCi(env)).rejects.toThrow('recorded upload no longer matches')
        expect(server.requests.map(request => request.method)).toEqual(['GET'])
      } else if (scenario === 'approval') {
        await expect(publishWebsiteCi({ ...env, DESKTOP_WEBSITE_APPROVAL: 'changed' })).rejects.toThrow('approved build or destination changed')
        expect(server.requests).toHaveLength(0)
      } else {
        const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
        await publishWebsiteCi(env)
        const uploaded = scenario === 'put' || scenario === 'upload' || scenario === 'metadata'
        expect(output.mock.calls.map(call => String(call[0])).join('')).toContain(uploaded
          ? 'Website installer uploaded:' : 'identical remote bytes and download filename confirmed; skipped')
        expect(server.requests[0]!.path.split('?')[0]).toBe('/production-123/desktop/fiwen-latest-macos-arm64.dmg')
        expect(server.requests.map(request => request.method)).toEqual(uploaded ? ['GET', 'PUT', 'GET'] : ['GET'])
        expect(JSON.parse(await readFile(join(records, 'state.json'), 'utf8'))).toMatchObject({ approval, upload: 'uploaded' })
        expect(await readFile(env.GITHUB_OUTPUT, 'utf8')).toContain(`record=${records}`)
      }
    } finally { await server.close() }
  } finally { await rm(root, { recursive: true, force: true }) }
})
