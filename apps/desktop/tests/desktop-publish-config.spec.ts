import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { readDesktopPublishConfig, readDesktopUploadCredentials } from '../scripts/desktop-publish-config.ts'

const STORAGE = { bucket: 'fiwen-test', endpoint: 'https://s3.example.com', region: 'us-east-1' }

it('reads public settings without opening the absent credential file and requires production App settings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'publish-config-'))
  try {
    await mkdir(join(root, 'publishing'))
    const config = { ...STORAGE, origin: 'https://example.com', credentialsFile: join(root, 'absent.json') }
    await writeFile(join(root, 'publishing/test.json'), JSON.stringify(config))
    const selected = await readDesktopPublishConfig(root, 'test')
    expect(selected).toEqual(config)
    await expect(readDesktopUploadCredentials(selected)).rejects.toThrow(/cannot read valid upload credentials/u)
    await writeFile(join(root, 'publishing/production.json'), JSON.stringify({ ...config, origin: 'https://desktop.5wn.net' }))
    await expect(readDesktopPublishConfig(root, 'production')).rejects.toThrow(/GitHub App configuration/u)
    await writeFile(config.credentialsFile, JSON.stringify({ accessKeyId: 'fixture', secretAccessKey: 'fixture-only' }))
    await expect(readDesktopUploadCredentials(selected)).resolves.toEqual({
      accessKeyId: 'fixture', secretAccessKey: 'fixture-only', endpoint: STORAGE.endpoint, region: STORAGE.region,
    })
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('rejects a storage endpoint that is not a bare HTTPS origin', async () => {
  const root = await mkdtemp(join(tmpdir(), 'publish-config-'))
  try {
    await mkdir(join(root, 'publishing'))
    for (const endpoint of ['http://s3.example.com', 'https://s3.example.com/bucket']) {
      await writeFile(join(root, 'publishing/test.json'), JSON.stringify({ ...STORAGE, endpoint, origin: 'https://example.com',
        credentialsFile: join(root, 'absent.json') }))
      await expect(readDesktopPublishConfig(root, 'test')).rejects.toThrow(/HTTPS origin/u)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('does not include malformed credential contents in errors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'publish-config-'))
  try {
    const credentialsFile = join(root, 'credentials.json')
    await writeFile(credentialsFile, '{secret-value-should-not-appear')
    await expect(readDesktopUploadCredentials({ ...STORAGE, credentialsFile, origin: 'https://example.com' }))
      .rejects.not.toThrow(/secret-value/u)
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('rejects multiline App outputs before writing Actions output fields', async () => {
  const root = await mkdtemp(join(tmpdir(), 'publish-config-'))
  try {
    await mkdir(join(root, 'publishing'))
    const config = { ...STORAGE, origin: 'https://desktop.5wn.net', credentialsFile: join(root, 'absent.json'),
      githubApp: { clientId: 'app-id', privateKeyFile: join(root, 'key.pem') } }
    for (const githubApp of [
      { ...config.githubApp, clientId: 'app-id\nother=value' },
      { ...config.githubApp, privateKeyFile: join(root, 'key\nother=value') },
    ]) {
      await writeFile(join(root, 'publishing/production.json'), JSON.stringify({ ...config, githubApp }))
      await expect(readDesktopPublishConfig(root, 'production')).rejects.toThrow(/single-line/u)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})
