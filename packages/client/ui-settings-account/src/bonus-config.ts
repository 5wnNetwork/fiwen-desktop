/** Bonus notice options shared by Host and Client. */
import z from '@deepseek-ai/schemastery'

/** Bonus acknowledgement timings shared by Host and Client. */
export interface BonusConfig {
  /** First delay before retrying a failed bonus acknowledgement. */
  bonusAckRetryDelayMs: number
  /** Ceiling for the acknowledgement retry backoff. */
  bonusAckRetryMaxDelayMs: number
}
/** Validate public bonus options. */
export const BonusConfigFields = {
  bonusAckRetryDelayMs: z.number().min(1).default(1_000),
  bonusAckRetryMaxDelayMs: z.number().min(1).default(60_000),
}
/** Validate public bonus options. */
export const BonusConfig: z<Partial<BonusConfig>, BonusConfig> = z.object(BonusConfigFields)
/** Bootstrap key containing no account credentials. */
export const BONUS_CONFIG_GLOBAL = '__DSH_BONUS_CONFIG__'
