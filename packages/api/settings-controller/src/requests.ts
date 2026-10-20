/**
 * Shared request parsing for this package's Remote controllers: the domain
 * constraints that are more specific than the generated TypeScript codecs.
 * @module @deepseek-ai/dsh-api-settings-controller/src/requests.ts
 */

import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { z } from 'zod'

/**
 * Validate one wire payload against a request schema.
 * @param method - the Remote method being answered, named in the refusal.
 * @param schema - the payload's domain constraints.
 * @param value - the caller-supplied payload.
 * @returns the parsed request.
 * @throws RemoteError `gateway/bad-request` when the payload fails the schema.
 */
export function parseRequest<T>(method: string, schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new RemoteError('gateway/bad-request', `invalid payload for ${method}`, { issues: parsed.error.issues })
  }
  return parsed.data
}
