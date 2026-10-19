import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

describe('mobile Face Reading premium UI', () => {
  it('renders canonical local Reader artwork and both appearance modes', async () => {
    const screen = await source('apps/mobile/src/app/(tabs)/reading/face.tsx');
    const hero = await source('apps/mobile/src/features/face/FaceEditorialIntro.tsx');
    expect(screen).toContain('<FaceEditorialIntro readerId={presentationReader} />');
    expect(hero).toContain('resolveMobileChatPortraitV1(readerId)');
    expect(hero).toContain('findMobileReaderPresentationV1(readerId)');
    expect(hero).toContain("theme === 'dark' && styles.heroDark");
    expect(hero).toContain('분석 준비 중');
    expect(hero).not.toContain('https://');
    expect(hero).not.toContain('fetch(');
  });

  it('keeps the safe local camera and photo gallery flow and no upload', async () => {
    const face = await source('apps/mobile/src/app/(tabs)/reading/face.tsx');
    const camera = await source('apps/mobile/src/platform/media/MobileFrontCameraV1.tsx');
    expect(face).toContain('pickMobileFaceMediaFromLibraryV1');
    expect(face).toContain('choose(\'library\', pickMobileFaceMediaFromLibraryV1)');
    expect(face).toContain('<MobileFrontCameraV1');
    expect(face).toContain('setFrontCameraOpen(true)');
    expect(face).toContain("kind: 'ready', asset: photo");
    expect(face).toContain('source={{ uri: ready.uri }}');
    expect(face).toContain('resizeMode="contain"');
    expect(camera).toContain('facing="front"');
    expect(camera).toContain('mode="picture"');
    expect(camera).toContain('takePictureAsync');
    expect(camera).toContain('exif: false');
    expect(camera).toContain('normalizeMobileFaceMediaAssetV1');
    expect(camera).not.toContain('FormData');
    expect(camera).not.toContain('fetch(');
    expect(face).not.toContain('fetch(');
  });

  it('clearly marks unavailable analysis and preserves selected Reader and image through refresh', async () => {
    const face = await source('apps/mobile/src/app/(tabs)/reading/face.tsx');
    expect(face).toContain('accessibilityState={{ disabled: true }}');
    expect(face).toContain('현재는 사진 촬영·선택과 미리보기만 가능합니다.');
    expect(face).toContain('관상 분석 기능 준비 중');
    expect(face).toContain("current.kind === 'error' ? { kind: 'idle' } : current");
    expect(face).toContain('selected={presentationReader}');
    expect(face).toContain('vertical="face"');
    expect(face).toContain('기기 보안 저장소나 앱 기록에 저장하지 않습니다.');
  });
});
