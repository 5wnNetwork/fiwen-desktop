/** S3 transport for resumable Desktop publication; callers authorize writes and own the channel lock. */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3'
import { createDesktopS3, type DesktopS3Credentials } from './desktop-s3.ts'
import { s3Operation } from './s3-operation.ts'
import type { DesktopUploadPlan } from './desktop-upload-plan.ts'
import { desktopArtifactDigest, type DesktopPublishTransport } from './desktop-publish.ts'
import { DesktopS3OperationError, isMissingObject } from './desktop-publication-failure.ts'

/**
 * Create a bounded S3 transport restricted to the validated plan's object keys.
 * Administrators must keep bucket versioning absent; publication does not query bucket configuration.
 * @param plan Destination and exact object inventory; arbitrary keys are rejected.
 * @param credentials Credentials, endpoint and region for this deployment only.
 * @param createClient Client factory; absent uses the shared production client, tests supply a loopback endpoint.
 * @returns Streaming reads and single-attempt writes; transport construction performs no requests.
 */
export function desktopPublishS3(
  plan: DesktopUploadPlan, credentials: DesktopS3Credentials,
  createClient: (credentials: DesktopS3Credentials) => S3Client = createDesktopS3,
): DesktopPublishTransport {
  const keys = new Map(plan.artifacts.map(artifact => [artifact.key, artifact.channelMetadata]))
  const client = () => createClient(credentials)
  const location = (key: string): void => {
    if (!keys.has(key)) throw new Error('desktop publish: object is outside the selected plan')
  }
  return {
    async read(key, channel) {
      location(key)
      if (keys.get(key) !== channel) throw new Error('desktop publish: object role mismatch')
      const sha512 = createHash('sha512')
      const chunks: Buffer[] = []
      let size = 0
      const output = new Writable({
        write(bytes: Buffer, _encoding, done) {
          size += bytes.length
          if (channel && size > 1024 * 1024) { done(new Error('desktop publish: channel metadata exceeds 1 MiB')); return }
          sha512.update(bytes)
          if (channel) chunks.push(Buffer.from(bytes))
          done()
        },
      })
      try {
        const s3 = client()
        const response = await s3Operation(900_000, signal => s3.send(
          new GetObjectCommand({ Bucket: plan.bucket, Key: key }), { abortSignal: signal },
        ), 'GetObject')
        if (!(response.Body instanceof Readable)) throw new Error('desktop publish: empty object body')
        await pipeline(response.Body, output)
        return { size, sha512: sha512.digest('base64'), ...(channel ? { contents: Buffer.concat(chunks).toString('utf8') } : {}) }
      } catch (error) {
        if (isMissingObject(error)) return null
        throw new DesktopS3OperationError('GetObject', error)
      } finally { output.destroy() }
    },
    async put(artifact, digest, forbidOverwrite) {
      location(artifact.key)
      if (keys.get(artifact.key) !== artifact.channelMetadata || forbidOverwrite === artifact.channelMetadata) {
        throw new Error('desktop publish: object write policy mismatch')
      }
      const actual = await desktopArtifactDigest(artifact)
      if (actual.size !== digest.size || actual.sha512 !== digest.sha512) throw new Error('desktop publish: local input changed')
      const md5 = createHash('md5')
      const bytes = artifact.contents === undefined ? createReadStream(artifact.path) : [Buffer.from(artifact.contents)]
      for await (const chunk of bytes) md5.update(chunk)
      const body = artifact.contents === undefined ? createReadStream(artifact.path) : Readable.from([Buffer.from(artifact.contents)])
      try {
        const s3 = client()
        await s3Operation(900_000, signal => s3.send(new PutObjectCommand({
          Bucket: plan.bucket, Key: artifact.key, Body: body, ContentLength: digest.size,
          ContentType: artifact.contentType, ContentMD5: md5.digest('base64'),
          ...(forbidOverwrite ? { IfNoneMatch: '*' } : {}),
        }), { abortSignal: signal }), 'PutObject')
      } catch (error) {
        throw new DesktopS3OperationError('PutObject', error)
      } finally { body.destroy() }
    },
  }
}
