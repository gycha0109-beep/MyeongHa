import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { translateMobileUiCopy } from '../apps/mobile/src/ui/mobile-ui-copy.js';
import { isMobileReaderPreviewSelectableV1, MOBILE_READER_INTERPRETATION_PUBLIC_V1 }
  from '../apps/mobile/src/features/reading/mobile-reader-presentation.js';

const messages = [
  "READER · 세연 프리뷰 장면",
  "현재 세연만 프리뷰 장면을 선택할 수 있으며, 유료 Reader 해석은 아직 공개되지 않았습니다.",
  "Reader 표시와 프리뷰 선택은 상품 지원, 구매 접근권, 공개 승인 또는 공식 Reading 열람 권한을 뜻하지 않습니다. 이 권한들은 서버가 각각 확인해야 합니다.",
  "선택한 Reader는 현재 사주 프리뷰 화면의 표시만 바꿉니다. 해석 근거와 내용은 변경되지 않습니다.",
  "선택한 Reader는 현재 관상 준비 화면의 표시만 바꿉니다. 사진 분석과 Reader 풀이는 아직 열리지 않았습니다."
] as const;

describe('Reader picker static HOLD and permission notices in five UI languages', () => {
  it('renders every client-authored Reader disclaimer without Korean fallback', () => {
    for (const source of messages) {
      expect(translateMobileUiCopy(source, 'ko-KR')).toBe(source);
      for (const locale of ['ja-JP','zh-TW','en-US','zh-CN'] as const) {
        const rendered = translateMobileUiCopy(source, locale);
        expect(rendered, `${locale} / ${source}`).not.toBe(source);
        expect(rendered).not.toMatch(/[가-힣]/u);
      }
    }
  });

  it('preserves the Saju/Face picker and its existing non-public access boundaries', async () => {
    const picker = await readFile(new URL('../apps/mobile/src/features/reading/MobileReaderPicker.tsx', import.meta.url), 'utf8');
    for (const message of messages) expect(picker).toContain(message);
    expect(picker).toContain('disabled={!available}');
    expect(picker).toContain('isMobileReaderPreviewSelectableV1(option.key)');
    expect(picker).not.toContain('officialReadingId');
    expect(picker).not.toContain('fetch(');
    expect(isMobileReaderPreviewSelectableV1('seyeon')).toBe(true);
    expect(isMobileReaderPreviewSelectableV1('baekheon')).toBe(false);
    expect(MOBILE_READER_INTERPRETATION_PUBLIC_V1).toBe(false);
  });
});
