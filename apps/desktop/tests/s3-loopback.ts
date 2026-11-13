/** Loopback HTTP origin for tests that exercise real S3 client request serialization. */

import { createServer, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { S3Client } from '@aws-sdk/client-s3'
import { createDesktopS3, type DesktopS3Credentials } from '../../desktop-publisher/src/desktop-s3.ts'

/** One request the client actually sent, with bytes read from the wire. */
export interface S3LoopbackRequest {
  readonly method: string
  /** Path-style request path (`/<bucket>/<key>`) including the query string. */
  readonly path: string
  /** Lowercased request headers exactly as the client wrote them. */
  readonly headers: Record<string, string | string[] | undefined>
  /** Exact body bytes received. */
  readonly body: Buffer
}

/** Owns one request's reply; use {@link answer} for a complete response. */
export type S3LoopbackResponder = (request: S3LoopbackRequest, response: ServerResponse) => void | Promise<void>

/** One isolated HTTP origin that captures S3 requests instead of reaching object storage. */
export interface S3Loopback {
  readonly requests: S3LoopbackRequest[]
  /** Credentials whose endpoint is this server; the secret is a fixture value tests check for leaks. */
  readonly credentials: DesktopS3Credentials
  /** Production client factory bound to this server. */
  client(): S3Client
  /** Close the server; rejects with the first responder failure so no reply error stays silent. */
  close(): Promise<void>
}

/** Fixture secret that must never appear in retained records. */
export const LOOPBACK_SECRET = 'test-credential-secret'

/**
 * Write a complete response and close the connection so the client cannot reuse its socket.
 * @param socket Response object owned by the responder.
 * @param status HTTP status code.
 * @param body Complete response body.
 * @param headers Additional response headers.
 */
export function answer(socket: ServerResponse, status = 200, body: string | Buffer = '',
  headers: Record<string, string> = {}): void {
  socket.writeHead(status, { connection: 'close', ...headers })
  socket.end(body)
}

/**
 * Build an S3 error body the client maps to its error name.
 * @param code S3 error code, such as `NoSuchKey` or `InternalError`.
 * @param message Server message; tests use it to show diagnostics stay out of retained records.
 * @returns XML error document.
 */
export function s3Error(code: string, message = 'fixture'): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${message}</Message></Error>`
}

/**
 * Start a loopback server that records each request before the responder answers it.
 * @param responder Reply for each captured request; the default is an empty 200.
 * @returns Recorded requests, a bound client factory, and an idempotent close.
 */
export async function startS3Loopback(
  responder: S3LoopbackResponder = (_request, response) => { answer(response) },
): Promise<S3Loopback> {
  const requests: S3LoopbackRequest[] = []
  const failures: unknown[] = []
  const server = createServer((incoming, response) => {
    const chunks: Buffer[] = []
    incoming.on('data', (chunk: Buffer) => chunks.push(chunk))
    incoming.on('end', () => {
      const request: S3LoopbackRequest = {
        method: incoming.method ?? '', path: incoming.url ?? '', headers: incoming.headers, body: Buffer.concat(chunks),
      }
      requests.push(request)
      void Promise.resolve(responder(request, response)).catch((error: unknown) => {
        failures.push(error)
        response.destroy()
      })
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() })
  })
  const { port } = server.address() as AddressInfo
  const credentials: DesktopS3Credentials = {
    accessKeyId: 'test-credential-id', secretAccessKey: LOOPBACK_SECRET, endpoint: `http://127.0.0.1:${port}`, region: 'us-east-1',
  }
  let closed = false
  return {
    requests,
    credentials,
    client: () => createDesktopS3(credentials),
    async close() {
      if (closed) return
      closed = true
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close((error) => {
        if (error === undefined) resolve()
        else reject(error)
      }))
      if (failures.length > 0) throw failures[0]
    },
  }
}
