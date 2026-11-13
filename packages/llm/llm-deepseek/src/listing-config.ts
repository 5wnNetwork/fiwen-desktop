/** Configuration of a route that follows a `/models` listing: cache timing and its validation. */
import type { Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'

/** Default deadline of one model-listing request and of a first-use wait. */
export const DEFAULT_MODELS_TIMEOUT_MS = 5_000
/** Default interval between automatic listing refreshes after first use. */
export const DEFAULT_MODELS_MAX_AGE_MS = 600_000

/** Listing fields of a route Config. */
export interface ModelListingConfig {
  /** Deadline of one listing request, which also bounds a first-use wait (default five seconds). */
  modelsTimeoutMs: Volatile<number>
  /**
   * Listing refresh interval after first use; failures retry at the same interval (default ten minutes).
   * Zero refreshes on each access and disables automatic refresh.
   */
  modelsMaxAgeMs: Volatile<number>
}

/** Schemas of the {@link ModelListingConfig} fields. */
export const modelListingConfigFields = {
  modelsTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_MODELS_TIMEOUT_MS).volatile(),
  modelsMaxAgeMs: z.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_MODELS_MAX_AGE_MS).volatile(),
}

/** Plain listing options accepted by {@link resolveListingTiming}. */
export interface ModelListingOptions {
  modelsTimeoutMs?: number
  modelsMaxAgeMs?: number
}

/** What a route offers while it holds no listing: this build's catalog, or no models. */
export type UnlistedCatalog = 'built-in' | 'none'

/** Optional listing options of a route that retries failures separately and may offer no models before a listing loads. */
export interface ListingRetryOptions {
  /** Failed-load age after which the next access retries the listing. */
  modelsRetryAgeMs?: number
  /** What the route offers while it holds no listing. */
  modelsWithoutListing?: UnlistedCatalog
}

/** Listing cache timing of one configuration generation. */
export interface ListingTiming {
  /** Deadline of one listing request. */
  readonly timeoutMs: number
  /** Listing age after which the next access refreshes it. */
  readonly maxAgeMs: number
  /** Failed-load age after which the next access retries the listing; absent, a failure retries after `maxAgeMs`. */
  readonly retryAgeMs?: number
  /** What the route offers while it holds no listing; absent, the route offers its built-in catalog. */
  readonly withoutListing?: UnlistedCatalog
}

/** Listing endpoint and cache timing of one configuration generation. */
export interface ListingSettings extends ListingTiming {
  /** Listing endpoint; it always shares the Messages origin. */
  readonly url: string
}

/**
 * Validate listing timing and retry options. Settings updates can reach it without schema validation, so every bound is judged here.
 * @param options - plain listing options; absent values take the defaults.
 * @param owner - plugin name that prefixes each failure message.
 * @returns the validated timing.
 * @throws Error when a value is outside its schema bounds.
 */
export function resolveListingTiming(options: ModelListingOptions & ListingRetryOptions, owner: string): ListingTiming {
  const {
    modelsTimeoutMs = DEFAULT_MODELS_TIMEOUT_MS,
    modelsMaxAgeMs = DEFAULT_MODELS_MAX_AGE_MS,
    modelsRetryAgeMs,
    modelsWithoutListing,
  } = options
  if (!Number.isFinite(modelsTimeoutMs) || modelsTimeoutMs <= 0 || modelsTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`${owner}: modelsTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`)
  }
  if (!Number.isSafeInteger(modelsMaxAgeMs) || modelsMaxAgeMs < 0) {
    throw new Error(`${owner}: modelsMaxAgeMs must be a non-negative safe integer`)
  }
  if (modelsRetryAgeMs !== undefined && (!Number.isSafeInteger(modelsRetryAgeMs) || modelsRetryAgeMs < 0)) {
    throw new Error(`${owner}: modelsRetryAgeMs must be a non-negative safe integer`)
  }
  if (modelsWithoutListing !== undefined && !['built-in', 'none'].includes(modelsWithoutListing)) {
    throw new Error(`${owner}: modelsWithoutListing must be "built-in" or "none"`)
  }
  return {
    timeoutMs: modelsTimeoutMs, maxAgeMs: modelsMaxAgeMs,
    ...modelsRetryAgeMs === undefined ? {} : { retryAgeMs: modelsRetryAgeMs },
    ...modelsWithoutListing === undefined ? {} : { withoutListing: modelsWithoutListing },
  }
}
