import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  mobileBirthAuthoredErrorCopyV1,
  MOBILE_BIRTH_AUTHORED_ERRORS_V1,
} from '../apps/mobile/src/features/birth/mobile-birth-error-copy.js';
import { translateMobileUiCopy } from '../apps/mobile/src/ui/mobile-ui-copy.js';

describe('Birth form authored errors in five supported UI languages', () => {
  it('covers the current canonical client-owned failure messages without translating unknown content', () => {
    expect(MOBILE_BIRTH_AUTHORED_ERRORS_V1).toHaveLength(19);
    expect(new Set(MOBILE_BIRTH_AUTHORED_ERRORS_V1).size).toBe(MOBILE_BIRTH_AUTHORED_ERRORS_V1.length);
    const personal = '실제 사용자 응답: 생년월일이 다릅니다';
    for (const locale of ['ko-KR', 'ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const) {
      expect(mobileBirthAuthoredErrorCopyV1(personal, locale)).toBe(personal);
      expect(mobileBirthAuthoredErrorCopyV1('', locale)).toBe('');
      for (const source of MOBILE_BIRTH_AUTHORED_ERRORS_V1) {
        const rendered = mobileBirthAuthoredErrorCopyV1(source, locale);
        if (locale === 'ko-KR') expect(rendered).toBe(source);
        else {
          expect(rendered, `${locale}: ${source}`).not.toBe(source);
          expect(rendered).not.toMatch(/[가-힣]/u);
          if (locale === 'en-US' || locale === 'zh-CN') {
            const reviewed = translateMobileUiCopy(source, locale);
            if (reviewed !== source) expect(rendered).toBe(reviewed);
          }
        }
      }
    }
  });

  it('covers the exact Birth screen, date and 12-hour clock validation sources', async () => {
    const paths = [
      'apps/mobile/src/features/birth/birth-input.ts',
      'apps/mobile/src/features/birth/birth-clock-12hour.ts',
      'apps/mobile/src/app/birth/index.tsx',
    ] as const;
    const [date, clock, screen] = await Promise.all(paths.map(path =>
      readFile(new URL(`../${path}`, import.meta.url), 'utf8'),
    ));
    for (const value of MOBILE_BIRTH_AUTHORED_ERRORS_V1) {
      const fromTemplate = /^(출생 월|출생 일)(을 입력해 주세요\.|을 확인해 주세요\.)$/u.exec(value);
      if (fromTemplate !== null) {
        expect(date).toContain('${name}' + fromTemplate[2]);
      } else {
        expect(date.includes(value) || clock.includes(value) || screen.includes(value)).toBe(true);
      }
    }
    expect(screen).toContain('mobileBirthAuthoredErrorCopyV1(error, locale)');
    expect(screen).not.toContain('{t(error)}');
    expect(screen).toContain('buildMobileBirthProfileCreateRequestV1({');
    expect(screen).toContain('cause instanceof MobileBirthInputValidationErrorV1');
  });
});
