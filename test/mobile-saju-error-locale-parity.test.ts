import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

import { mobileSajuErrorCopyV1 } from '../apps/mobile/src/features/saju/mobile-saju-error-copy.js';

const cases = [
  {
    kind: 'auth_error',
    korean: '세션을 다시 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  },
  {
    kind: 'saju_unavailable',
    korean: '현재 명식 계산 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  },
  {
    kind: 'authority_mismatch',
    korean: '출생정보는 등록되어 있지만 현재 명식과 연결하지 못했습니다.',
  },
  {
    kind: 'error',
    korean: '현재 사주 정보를 불러오지 못했습니다.',
  },
] as const;

describe('mobile Saju fixed error UI, five-language parity', () => {
  it('keeps existing Korean wording and provides localized guidance for all four failures', () => {
    for (const { kind, korean } of cases) {
      expect(mobileSajuErrorCopyV1(kind, 'ko-KR')).toBe(korean);
      for (const locale of ['ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const) {
        const localized = mobileSajuErrorCopyV1(kind, locale);
        expect(localized.length).toBeGreaterThan(0);
        expect(localized).not.toBe(korean);
        expect(localized).not.toMatch(/[가-힣]/u);
      }
    }
  });

  it('uses only the loader error category while preserving authorization and retry rules', async () => {
    const [screen, loader] = await Promise.all([
      readFile(new URL('../apps/mobile/src/app/(tabs)/reading/index.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/saju/mobile-saju-loader.ts', import.meta.url), 'utf8'),
    ]);
    expect(screen).toContain('mobileSajuErrorCopyV1(state.kind, locale)');
    expect(screen).toContain('state.retryable ?');
    expect(screen).not.toContain('errorCopy(state)');
    expect(screen).not.toContain('fetch(');
    expect(loader).toContain("kind: 'authority_mismatch', retryable: false");
    expect(loader).toContain("kind: 'auth_error', retryable: true");
    expect(loader).toContain("kind: 'saju_unavailable', retryable: true");
  });
});
