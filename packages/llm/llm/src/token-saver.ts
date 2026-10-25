/**
 * Server-side request compression modes for backend-routed models.
 * Unlike {@link ReasoningEffortId}, this is a fixed wire vocabulary shared
 * by every route that advertises the capability; the route's listing declares
 * which subset it accepts and which concrete mode `'default'` resolves to.
 * @module dsh-llm/token-saver
 */

/** One selectable saver mode; `'default'` defers to the backend's administered mode. */
export type LlmTokenSaverMode = 'default' | 'simple' | 'disabled' | 'coding-low' | 'coding-high'

/** Concrete saver modes `'default'` resolves to; `'default'` itself is excluded. */
export type LlmTokenSaverResolvedMode = Exclude<LlmTokenSaverMode, 'default'>

/** Every {@link LlmTokenSaverMode} in picker order. */
export const LLM_TOKEN_SAVER_MODES = [
  'default', 'simple', 'disabled', 'coding-low', 'coding-high',
] as const satisfies readonly LlmTokenSaverMode[]

/**
 * Narrow an arbitrary value to a saver mode.
 * @param value - candidate mode value.
 * @returns whether `value` is one of the five {@link LlmTokenSaverMode} strings.
 */
export function isLlmTokenSaverMode(value: unknown): value is LlmTokenSaverMode {
  return typeof value === 'string' && (LLM_TOKEN_SAVER_MODES as readonly string[]).includes(value)
}

/**
 * Narrow an arbitrary value to a concrete (non-`'default'`) saver mode.
 * @param value - candidate mode value.
 * @returns whether `value` is a {@link LlmTokenSaverMode} other than `'default'`.
 */
export function isLlmTokenSaverResolvedMode(value: unknown): value is LlmTokenSaverResolvedMode {
  return isLlmTokenSaverMode(value) && value !== 'default'
}
