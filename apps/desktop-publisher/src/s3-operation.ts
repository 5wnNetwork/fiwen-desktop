/** Total deadline for one S3 operation; a timed-out transfer is never retried. */

/**
 * Run one S3 operation under a total deadline.
 *
 * The deadline covers the whole operation, including time spent writing a streamed body, so an
 * unanswered socket cannot hold a publication open. Expiry aborts the request through the caller's
 * signal and rejects with a `TimeoutError`-named error; the remote outcome is then unknown and the
 * caller must reconcile before retrying.
 * @param timeoutMs Total network-operation budget in milliseconds.
 * @param operation Receives the abort signal to pass to the SDK and returns the operation result.
 * @param label Operation name used in the timeout message.
 * @returns Operation result; expiration rejects with TimeoutError after aborting the transport.
 */
export async function s3Operation<T>(
  timeoutMs: number, operation: (signal: AbortSignal) => Promise<T>, label = 'S3 operation',
): Promise<T> {
  const controller = new AbortController()
  const timeout = new Error(`${label} exceeded its deadline`)
  timeout.name = 'TimeoutError'
  const timer = setTimeout(() => { controller.abort(timeout) }, timeoutMs)
  try {
    const result = await operation(controller.signal)
    if (controller.signal.aborted) throw timeout
    return result
  } catch (error) {
    if (controller.signal.aborted) throw timeout
    throw error
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}
