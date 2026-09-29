import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readRepoFile(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile M7 Face media staging structure', () => {
  it('requests image-only picker output without EXIF/base64 projection', async () => {
    const media = await readRepoFile('apps/mobile/src/platform/media/expo-face-media-picker.ts');
    expect(media).toContain("mediaTypes: ['images']");
    expect(media).toContain('exif: false');
    expect(media).toContain('base64: false');
    expect(media).toContain('CameraType.front');
    expect(media).not.toContain('FormData');
    expect(media).not.toContain('fetch(');
  });

  it('keeps Face analysis disabled and does not persist the selected image', async () => {
    const screen = await readRepoFile('apps/mobile/src/app/(tabs)/reading/face.tsx');
    expect(screen).toContain('서버 분석은 시작하지 않습니다');
    expect(screen).toContain('disabled');
    expect(screen).not.toContain('SecureStore');
    expect(screen).not.toContain('AsyncStorage');
    expect(screen).not.toContain('FormData');
    expect(screen).not.toContain('fetch(');
  });

  it('does not add Face as a sixth primary tab', async () => {
    const tabs = await readRepoFile('apps/mobile/src/app/(tabs)/_layout.tsx');
    expect(tabs).not.toContain('name="face"');
    expect(tabs).not.toContain("title: '관상'");
  });

  it('blocks microphone permission for a photo-only capture path', async () => {
    const config = await readRepoFile('apps/mobile/app.json');
    expect(config).toContain('"expo-image-picker"');
    expect(config).toContain('"microphonePermission": false');
  });
});
