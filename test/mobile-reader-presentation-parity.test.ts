import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { READER_PRESENTATIONS } from '../apps/web/reader-presentation-catalog.js';
import {
  MOBILE_READER_PRESENTATIONS_V1,
  findMobileReaderPresentationV1,
} from '../apps/mobile/src/features/reading/mobile-reader-presentation.js';

const source = (p: string) =>
  readFile(new URL('../' + p, import.meta.url), 'utf8');

describe('mobile Saju and Face Reader presentation parity', () => {
  it('uses the same nine presentation names, titles, tones, and canonical ids as Web', () => {
    const projection = (v: { key: string; name: string; title: string; tone: string }) =>
      ({ key: v.key, name: v.name, title: v.title, tone: v.tone });
    expect(MOBILE_READER_PRESENTATIONS_V1.map(projection))
      .toEqual(READER_PRESENTATIONS.map(projection));
    expect(MOBILE_READER_PRESENTATIONS_V1).toHaveLength(9);
    expect(findMobileReaderPresentationV1('seyeon').name).toBe('세연');
    expect(findMobileReaderPresentationV1('baekheon').name).toBe('백헌');
  });

  it('only changes presentation in the Saju calculation/preview and Face photo-stage screens', async () => {
    const [saju, face, picker] = await Promise.all([
      source('apps/mobile/src/app/(tabs)/reading/index.tsx'),
      source('apps/mobile/src/app/(tabs)/reading/face.tsx'),
      source('apps/mobile/src/features/reading/MobileReaderPicker.tsx'),
    ]);
    expect(saju).toContain('<MobileReaderPicker');
    expect(saju).toContain('vertical="saju"');
    expect(saju).toContain('<SajuPreviewReadingView />');
    expect(face).toContain('<MobileReaderPicker');
    expect(face).toContain('vertical="face"');
    expect(face).toContain('disabled\n        style={styles.primaryDisabled}');
    expect(picker).toContain('해석 근거와 내용은 변경되지 않습니다.');
    expect(picker).toContain('사진 분석과 Reader 풀이는 아직 열리지 않았습니다.');
  });

  it('does not promote a Reader pick into an artificial server identity', async () => {
    const picker = await source('apps/mobile/src/features/reading/MobileReaderPicker.tsx');
    const saju = await source('apps/mobile/src/app/(tabs)/reading/index.tsx');
    const face = await source('apps/mobile/src/app/(tabs)/reading/face.tsx');
    for (const c of [picker, saju, face]) {
      expect(c).not.toContain('mobileReaderInterpretationServiceV1.read(');
      expect(c).not.toContain('publicRouteActivated: true');
      expect(c).not.toContain('readerCharacterId: presentationReader');
    }
  });
});
