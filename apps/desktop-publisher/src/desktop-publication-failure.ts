/** Safe failure details shared by publication diagnostics and durable journals. */
import { ZodError } from 'zod'
import { DesktopPublishError } from './desktop-publish.ts'

const publicCodes = new Set(['AccessDenied', 'InternalError', 'NoSuchBucket', 'NoSuchKey', 'BadDigest', 'SignatureDoesNotMatch',
  'RequestTimeout', 'TimeoutError', 'AbortError', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ENOSPC', 'EACCES', 'EPERM', 'ENOENT'])

/** S3 answers a missing key with 404; no other status means absence. */
export function isMissingObject(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  if ('code' in error && error.code === 'NoSuchKey') return true
  if (!('$metadata' in error)) return false
  const metadata = error.$metadata
  return typeof metadata === 'object' && metadata !== null && 'httpStatusCode' in metadata && metadata.httpStatusCode === 404
}

/** Request id and status an S3 client records on its own errors. */
function s3Metadata(cause: object): { requestId?: string; statusCode?: number } {
  const metadata = '$metadata' in cause && typeof cause.$metadata === 'object' && cause.$metadata !== null ? cause.$metadata : {}
  const requestId = 'requestId' in metadata ? metadata.requestId : 'RequestId' in cause ? cause.RequestId : undefined
  const statusCode = 'httpStatusCode' in metadata ? metadata.httpStatusCode : 'statusCode' in cause ? cause.statusCode : undefined
  return { ...(typeof requestId === 'string' ? { requestId } : {}), ...(typeof statusCode === 'number' ? { statusCode } : {}) }
}

/** S3 operation failure retaining its cause for safe diagnostics; a failed write may have an unknown remote outcome. */
export class DesktopS3OperationError extends Error {
  constructor(readonly operation: 'GetObject' | 'PutObject', cause: unknown) {
    const failure = desktopPublicationFailure(cause, operation)
    const message = failure.code === 'AccessDenied'
      ? `AccessDenied. Check the access key's s3:${operation} permission and explicit deny rules for the selected bucket/object. Publication stopped; reconcile remote state before retrying.`
      : failure.message
    super(`S3 ${operation}: ${message}`, { cause })
    this.name = 'DesktopS3OperationError'
  }
}

/**
 * Keep actionable local validation details without recording SDK response bodies or credentials.
 * @param error Failure from validation, filesystem, subprocess or remote transport.
 * @param phase Operation stage known by the entrypoint.
 * @returns Credential-free diagnostic suitable for stderr and an audit event.
 */
export function desktopPublicationFailure(error: unknown, phase: string): {
  phase: string
  code: string
  message: string
  operation?: 'GetObject' | 'PutObject'
  requestId?: string
  httpStatus?: number
} {
  if (error instanceof DesktopS3OperationError) {
    const cause = typeof error.cause === 'object' && error.cause !== null ? error.cause : {}
    const { requestId, statusCode } = s3Metadata(cause)
    return { ...desktopPublicationFailure(error.cause, phase), operation: error.operation, message: error.message,
      ...(requestId !== undefined && /^[\w+/=.-]{1,256}$/u.test(requestId) ? { requestId } : {}),
      ...(statusCode !== undefined && Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599
        ? { httpStatus: statusCode } : {}) }
  }
  if (error instanceof DesktopPublishError) return { phase, code: error.code, message: error.message }
  if (error instanceof ZodError) return { phase, code: 'invalid-data',
    message: `Invalid fields: ${error.issues.map(issue => `${issue.path.join('.') || '(root)'} (${issue.code})`).join(', ')}` }
  if (error instanceof SyntaxError) return { phase, code: 'invalid-json', message: 'Invalid JSON; check the configuration or retained record for this stage.' }
  const ownedMessage =
    /^(desktop (?:publish|archival|release store|retention|rollback|tag|upload|auto-update|macOS signing|build)[^\n]*:|Usage:)/u
  const websiteMessage = /^website (?:publication|installer):/u
  if (error instanceof Error && (ownedMessage.test(error.message) || websiteMessage.test(error.message))) {
    return { phase, code: 'validation', message: error.message }
  }
  const record = typeof error === 'object' && error !== null ? error : {}
  const meta = '$metadata' in record && typeof record.$metadata === 'object' && record.$metadata !== null ? record.$metadata : undefined
  const candidate = 'code' in record ? record.code : 'name' in record ? record.name : undefined
  const code = typeof candidate === 'string' && publicCodes.has(candidate) ? candidate : 'operation-failed'
  const statusCode = meta !== undefined && 'httpStatusCode' in meta ? meta.httpStatusCode : 'statusCode' in record ? record.statusCode : undefined
  const status = typeof statusCode === 'number' ? ` (HTTP ${statusCode})` : ''
  const path = ['ENOENT', 'EACCES', 'EPERM', 'ENOSPC'].includes(code) && 'path' in record && typeof record.path === 'string'
    ? `: ${record.path}` : ''
  return { phase, code, message: `${code}${status}${path}. Check this stage's local files, signature verification or service permissions; raw provider output is omitted.` }
}
