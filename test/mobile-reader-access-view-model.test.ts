import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  createMobileReaderAccessViewStateV1,
} from '../apps/mobile/src/features/reading/mobile-reader-access-view-model.js';
import {
  MOBILE_READER_INTERPRETATION_PUBLIC_V1,
  MOBILE_READER_PRESENTATIONS_V1,
} from '../apps/mobile/src/features/reading/mobile-reader-presentation.js';

describe('mobile Reader availability projection is not an admission grant', () => {
  it('preserves the nine approved presentation IDs and Seyeon-only preview', () => {
    expect(MOBILE_READER_PRESENTATIONS_V1.map((reader) => reader.key)).toEqual([
      'seyeon', 'baekheon', 'yeoul', 'seorin', 'rahyeon',
      'mira', 'taegyeom', 'yunho', 'doyun',
    ]);
    expect(MOBILE_READER_INTERPRETATION_PUBLIC_V1).toBe(false);

    for (const reader of MOBILE_READER_PRESENTATIONS_V1) {
      const state = createMobileReaderAccessViewStateV1(reader.key);
      expect(state.readerId).toBe(reader.key);
      expect(state.previewPresentation).toBe(
        reader.key === 'seyeon' ? 'preview_available' : 'concept_pending',
      );
      expect(state.interpretationRoute).toBe('public_route_off');
      expect(Object.isFrozen(state)).toBe(true);
    }
  });

  it('does not infer Product, purchase, publication, or Reading access', () => {
    for (const reader of MOBILE_READER_PRESENTATIONS_V1) {
      const state = createMobileReaderAccessViewStateV1(reader.key);
      expect(state.productEligibility).toEqual({ kind: 'not_checked' });
      expect(state.purchaseAccess).toEqual({ kind: 'not_checked' });
      expect(state.releaseApproval).toEqual({ kind: 'not_checked' });
      expect(state.officialReadingAccess).toEqual({ kind: 'not_checked' });
    }
  });

  it('keeps both picker and archive UI strictly presentation-only', async () => {
    const [picker, detail, nativeService] = await Promise.all([
      readFile(new URL('../apps/mobile/src/features/reading/MobileReaderPicker.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/app/reading/[readingId].tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/reading/native-mobile-reader-interpretation-service.ts', import.meta.url), 'utf8'),
    ]);
    expect(picker).toContain('createMobileReaderAccessViewStateV1(option.key)');
    expect(picker).toContain('disabled={!available}');
    expect(picker).toContain('컨셉 준비 중');
    expect(picker).toContain('상품 지원, 구매 접근권, 공개 승인');
    expect(detail).toContain('이 공식 Reading과 Reader');
    expect(detail).toContain('Reader 연결 정보는 해설 구매·열람 권한 또는 해설 완료의 증명이 아닙니다.');
    expect(detail).toContain('state.record.readerCharacterIds.length');
    expect(detail).toContain('mobileRecordsServiceV1.readOfficialReading(readingId)');
    expect(detail).not.toContain('mobileReaderInterpretationServiceV1.read(');
    expect(nativeService).not.toContain('publicRouteActivated: true');
  });
});
