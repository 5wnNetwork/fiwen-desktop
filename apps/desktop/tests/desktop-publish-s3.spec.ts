import { expect, it } from 'vitest'
import { desktopPublishS3 } from '../../desktop-publisher/src/desktop-publish-s3.ts'
import { desktopArtifactDigest } from '../../desktop-publisher/src/desktop-publish.ts'
import type { DesktopUploadPlan } from '../../desktop-publisher/src/desktop-upload-types.ts'
import { desktopPublicationFailure } from '../../desktop-publisher/src/desktop-publication-failure.ts'
import { createDesktopS3 } from '../../desktop-publisher/src/desktop-s3.ts'
import { answer, LOOPBACK_SECRET, s3Error, startS3Loopback } from './s3-loopback.ts'

const BUCKET = 'fixture-bucket'

function plan(artifact: DesktopUploadPlan['artifacts'][number]): DesktopUploadPlan {
  return { environment: 'test', target: 'win-x64', version: '1.0.0', bucket: BUCKET, publicUrl: 'https://example.com/',
    endpoint: 'https://s3.example.com', region: 'us-east-1', accessKeyIdEnvName: 'ID', secretAccessKeyEnvName: 'KEY', artifacts: [artifact] }
}

it('uses If-None-Match, streams verified bytes, and hashes remote readback through the client', async () => {
  const objects = new Map<string, Buffer>()
  const server = await startS3Loopback((request, response) => {
    const object = request.path.split('?')[0]!
    if (request.method === 'PUT') {
      expect(request.headers['if-none-match']).toBe('*')
      objects.set(object, request.body)
      answer(response)
    } else {
      const bytes = objects.get(object)
      if (bytes === undefined) answer(response, 404, s3Error('NoSuchKey'), { 'content-type': 'application/xml' })
      else answer(response, 200, bytes, { 'content-length': String(bytes.length) })
    }
  })
  try {
    const artifact = { path: '', filename: 'file.exe', key: 'bin/file.exe', contents: 'fixture bytes', contentType: 'application/octet-stream', channelMetadata: false }
    const transport = desktopPublishS3(plan(artifact), server.credentials, createDesktopS3)
    expect(await transport.read(artifact.key, false)).toBeNull()
    const digest = await desktopArtifactDigest(artifact)
    await transport.put(artifact, digest, true)
    expect(await transport.read(artifact.key, false)).toEqual(digest)
    await expect(transport.read('elsewhere/file.exe', false)).rejects.toThrow(/outside/u)
    expect(server.requests.map(request => `${request.method} ${request.path}`))
      .toEqual([`GET /${BUCKET}/bin/file.exe?x-id=GetObject`, `PUT /${BUCKET}/bin/file.exe?x-id=PutObject`, `GET /${BUCKET}/bin/file.exe?x-id=GetObject`])
    const put = server.requests[1]!
    expect(put.headers['content-encoding']).toBeUndefined()
    expect(put.headers['transfer-encoding']).toBeUndefined()
    expect(put.body.toString('utf8')).toBe('fixture bytes')
  } finally { await server.close() }
})

it('replaces channel metadata without If-None-Match', async () => {
  const server = await startS3Loopback((request, response) => {
    expect(request.headers['if-none-match']).toBeUndefined()
    answer(response)
  })
  try {
    const artifact = { path: '', filename: 'nightly.yml', key: 'feed/nightly.yml', contents: 'version: 1.0.0\n', contentType: 'application/yaml', channelMetadata: true }
    await desktopPublishS3(plan(artifact), server.credentials, createDesktopS3).put(artifact, await desktopArtifactDigest(artifact), false)
    expect(server.requests).toHaveLength(1)
  } finally { await server.close() }
})

it('rejects an oversized channel stream and closes the request', async () => {
  const server = await startS3Loopback((_request, response) => { answer(response, 200, Buffer.alloc(1024 * 1024 + 1, 65)) })
  try {
    const artifact = { path: '', filename: 'nightly.yml', key: 'feed/nightly.yml', contents: 'version: 1.0.0\n', contentType: 'application/yaml', channelMetadata: true }
    await expect(desktopPublishS3(plan(artifact), server.credentials, createDesktopS3).read(artifact.key, true)).rejects.toThrow()
    expect(server.requests).toHaveLength(1)
  } finally { await server.close() }
})

it.each(['GetObject', 'PutObject'] as const)('reports %s denial with a safe S3 receipt', async (operation) => {
  const server = await startS3Loopback((_request, response) => {
    answer(response, 403, s3Error('AccessDenied', LOOPBACK_SECRET), { 'content-type': 'application/xml', 'x-amz-request-id': 'fixture-request' })
  })
  try {
    const artifact = { path: '', filename: 'file.exe', key: 'bin/file.exe', contents: 'fixture bytes', contentType: 'application/octet-stream', channelMetadata: false }
    const transport = desktopPublishS3(plan(artifact), server.credentials, createDesktopS3)
    const digest = await desktopArtifactDigest(artifact)
    const pending = operation === 'GetObject' ? transport.read(artifact.key, false) : transport.put(artifact, digest, true)
    const failure = await pending.then(() => { throw new Error('Expected S3 denial') }, (error: unknown) => desktopPublicationFailure(error, 'publication'))
    expect(failure).toMatchObject({ operation, code: 'AccessDenied', httpStatus: 403, requestId: 'fixture-request' })
    expect(JSON.stringify(failure)).not.toContain(LOOPBACK_SECRET)
    await expect(JSON.stringify(failure, null, 2) + '\n').toMatchFileSnapshot(`./expected/s3-${operation}-denied.json`)
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]!.method).toBe(operation === 'GetObject' ? 'GET' : 'PUT')
  } finally { await server.close() }
})
