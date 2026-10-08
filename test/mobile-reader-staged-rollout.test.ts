import { describe, expect, it } from 'vitest';
import {
  MOBILE_READER_PREVIEW_CANDIDATE_IDS_V1,
  MOBILE_READER_INTERPRETATION_PUBLIC_V1,
  MOBILE_READER_PRESENTATIONS_V1,
  isMobileReaderPreviewSelectableV1,
} from '../apps/mobile/src/features/reading/mobile-reader-presentation.js';
import {
  READER_PREVIEW_CANDIDATE_IDS_V1,
  READER_PUBLIC_INTERPRETATION_ENABLED_V1,
} from '../apps/web/reader-rollout-policy.js';
import { readFile } from 'node:fs/promises';

describe('mobile/web Reader staged capability alignment', () => {
  it('reuses Seyeon first without deleting the nine Reader slots', () => {
    expect(MOBILE_READER_PREVIEW_CANDIDATE_IDS_V1).toEqual(READER_PREVIEW_CANDIDATE_IDS_V1);
    expect(MOBILE_READER_PREVIEW_CANDIDATE_IDS_V1).toEqual(['seyeon']);
    expect(MOBILE_READER_PRESENTATIONS_V1).toHaveLength(9);
    for (const reader of MOBILE_READER_PRESENTATIONS_V1) {
      expect(isMobileReaderPreviewSelectableV1(reader.key)).toBe(reader.key === 'seyeon');
    }
  });

  it('does not equate a Reader Preview selection with active paid Saju/Face Reader', () => {
    expect(MOBILE_READER_INTERPRETATION_PUBLIC_V1).toBe(false);
    expect(READER_PUBLIC_INTERPRETATION_ENABLED_V1).toBe(false);
  });

  it('hard-disables unready characters and leaves the approved server transport off', async () => {
    const [picker, native] = await Promise.all([
      readFile(new URL('../apps/mobile/src/features/reading/MobileReaderPicker.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/reading/native-mobile-reader-interpretation-service.ts', import.meta.url), 'utf8'),
    ]);
    expect(picker).toContain('disabled={!available}');
    expect(picker).toContain('if (!available) return;');
    expect(picker).toContain('컨셉 준비 중');
    expect(picker).toContain('유료 Reader 해석은 아직 공개되지 않았습니다.');
    expect(native).not.toContain('publicRouteActivated: true');
    expect(native).not.toContain('readerCharacterId:');
  });
});
