/**
 * Server-side text bounds for the four independent Character chat runtime.
 *
 * JavaScript String.length counts UTF-16 code units. These values preserve the
 * existing chat ingress limit and the current canonical-context bound. They
 * are not tokenizer measurements, model context-window limits, or cost caps.
 */
export const FOUR_CHARACTER_CHAT_MAX_MESSAGE_UTF16_CODE_UNITS_V1 = 8_000 as const;
export const FOUR_CHARACTER_CHAT_MAX_CANONICAL_CONTEXT_UTF16_CODE_UNITS_V1 = 32_768 as const;
