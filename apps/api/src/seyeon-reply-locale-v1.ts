import type { RequestUiLocaleV1 } from './request-ui-locale-v1.js';

export const SEYEON_REPLY_LOCALES_V1 = Object.freeze([
  'ko-KR', 'ja-JP', 'zh-TW', 'en-US', 'zh-CN',
] as const);

const directions: Readonly<Record<RequestUiLocaleV1, string>> = Object.freeze({
  'ko-KR': 'Write Se-yeon’s answer in natural, respectful Korean (한국어 존댓말).',
  'ja-JP': 'Write Se-yeon’s answer in natural Japanese (日本語), with conversational politeness appropriate to her character.',
  'zh-TW': 'Write Se-yeon’s answer in Traditional Chinese (繁體中文, Taiwan usage), not Simplified Chinese.',
  'en-US': 'Write Se-yeon’s answer in natural American English, not Korean.',
  'zh-CN': 'Write Se-yeon’s answer in Simplified Chinese (简体中文, mainland China usage), not Traditional Chinese.',
});

export function seyeonReplyLanguageInstructionV1(locale: RequestUiLocaleV1): string {
  return 'OUTPUT LANGUAGE IS BOUND TO THIS ONE USER TURN: ' + locale + '. ' +
    directions[locale] +
    ' The recent conversation may contain messages in other languages; never translate or rewrite past messages. ' +
    'Preserve the existing characterization, canonical authority, disclosure, and safety policies. ' +
    'Return the actual spoken utterance directly in the bound language. ' +
    'Do not announce or discuss a change of language unless the user asks.';
}

export class SeyeonReplyLanguageMismatchV1 extends Error {
  readonly code = 'SEYEON_REPLY_LANGUAGE_MISMATCH' as const;
  constructor(readonly locale: RequestUiLocaleV1) {
    super('Se-yeon generated a response outside the requested turn language.');
    this.name = 'SeyeonReplyLanguageMismatchV1';
  }
}

export function assertSeyeonReplyLanguageV1(
  utterance: string,
  locale: RequestUiLocaleV1,
): void {
  // The structured semantic review remains responsible for meaning, safety,
  // personality and privacy. This gate only catches clear script mismatches
  // before persistence (no silent post-generation translations).
  if (locale === 'ko-KR') return;
  const hasHangul = /[가-힣]/u.test(utterance);
  const hasKana = /[\u3040-\u30ff]/u.test(utterance);
  const hasHan = /[\u3400-\u9fff]/u.test(utterance);
  const hasLatin = /[a-z]/iu.test(utterance);
  const valid = !hasHangul && (
    locale === 'ja-JP' ? hasKana :
    locale === 'en-US' ? hasLatin && !hasHan && !hasKana :
    hasHan && !hasKana
  );
  if (!valid) throw new SeyeonReplyLanguageMismatchV1(locale);
}

