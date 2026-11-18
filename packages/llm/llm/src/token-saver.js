/**
 * Server-side request compression modes for backend-routed models.
 * Unlike {@link ReasoningEffortId}, this is a fixed wire vocabulary shared
 * by every route that advertises the capability; the route's listing declares
 * which subset it accepts and which concrete mode `'default'` resolves to.
 * @module dsh-llm/token-saver
 */
/** Every {@link LlmTokenSaverMode} in picker order. */
export const LLM_TOKEN_SAVER_MODES = [
    'default', 'simple', 'disabled', 'coding-low', 'coding-high',
];
/**
 * Narrow an arbitrary value to a saver mode.
 * @param value - candidate mode value.
 * @returns whether `value` is one of the five {@link LlmTokenSaverMode} strings.
 */
export function isLlmTokenSaverMode(value) {
    return typeof value === 'string' && LLM_TOKEN_SAVER_MODES.includes(value);
}
/**
 * Narrow an arbitrary value to a concrete (non-`'default'`) saver mode.
 * @param value - candidate mode value.
 * @returns whether `value` is a {@link LlmTokenSaverMode} other than `'default'`.
 */
export function isLlmTokenSaverResolvedMode(value) {
    return isLlmTokenSaverMode(value) && value !== 'default';
}
//# sourceMappingURL=token-saver.js.map