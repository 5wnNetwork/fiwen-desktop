/** Shared S3 client construction for Desktop update objects (Wasabi or any S3 API). */

import { S3Client } from '@aws-sdk/client-s3'

/** Request-level inactivity deadline for update transfers, in milliseconds. */
export const DESKTOP_S3_TRANSFER_TIMEOUT_MS = 900_000

/** Credentials and endpoint for one deployment; values are never written to retained records. */
export interface DesktopS3Credentials {
  readonly accessKeyId: string
  readonly secretAccessKey: string
  readonly endpoint: string
  readonly region: string
}

/**
 * Create an S3 client for one deployment's update bucket.
 *
 * Retries stay off (`maxAttempts: 1`): a failed write has an unknown remote outcome, so repeating it
 * could publish a second object or overwrite one a concurrent release just wrote. Callers reconcile
 * the bucket before retrying instead. Path-style addressing is forced so a bucket name never has to
 * be DNS-safe or delegated beneath the endpoint's domain. No cache headers are added, leaving cache
 * policy to deployment infrastructure.
 * @param credentials Access key, secret, endpoint and region for the selected deployment.
 * @param timeoutMs Request-level inactivity deadline; a caller that must not wait out a transfer passes its own.
 * @returns A client that sends requests to the configured endpoint; its callers validate that the endpoint is an HTTPS origin.
 */
export function createDesktopS3(
  credentials: DesktopS3Credentials, timeoutMs: number = DESKTOP_S3_TRANSFER_TIMEOUT_MS,
): S3Client {
  return new S3Client({
    region: credentials.region,
    endpoint: credentials.endpoint,
    forcePathStyle: true,
    maxAttempts: 1,
    // Default flexible checksums stream PUTs as `aws-chunked` with a trailer; keep plain bodies with Content-MD5.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey },
    requestHandler: { requestTimeout: timeoutMs, connectionTimeout: timeoutMs },
  })
}
