import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('mobile Face photo privacy across account changes', () => {
  it('clears an account-scoped face preview and closes the camera on verified credentials or blur', async () => {
    const face = await readFile(new URL('../apps/mobile/src/app/(tabs)/reading/face.tsx', import.meta.url), 'utf8');
    expect(face).toContain('useFocusEffect(useCallback(() => {');
    expect(face).toContain('subscribeMobileSubjectCredentialChangesV1(clearPrivatePhoto)');
    expect(face).toContain('unsubscribe()');
    expect(face).toContain('focused.current = false');
    expect(face).toContain('clearPrivatePhoto()');
    expect(face).toContain('ownerEpoch.current += 1');
    expect(face).toContain("setState({ kind: 'idle' })");
    expect(face).toContain('setFrontCameraOpen(false)');
    expect(face).toContain('cameraEpoch.current = null');
  });

  it('ignores a stale library selection, denial or camera frame after a subject switch', async () => {
    const face = await readFile(new URL('../apps/mobile/src/app/(tabs)/reading/face.tsx', import.meta.url), 'utf8');
    expect(face).toContain('const epoch = ownerEpoch.current');
    expect(face).toContain('if (!focused.current || epoch !== ownerEpoch.current) return');
    expect(face).toContain('if (!focused.current || cameraEpoch.current !== ownerEpoch.current) return');
    expect(face).toContain('cameraEpoch.current = ownerEpoch.current');
    expect(face).toContain("kind: 'ready', asset: photo");
  });

  it('preserves the approved local-only preview, reader presentation and same-screen pull refresh', async () => {
    const face = await readFile(new URL('../apps/mobile/src/app/(tabs)/reading/face.tsx', import.meta.url), 'utf8');
    expect(face).toContain("current.kind === 'error' ? { kind: 'idle' } : current");
    expect(face).toContain("choose('library', pickMobileFaceMediaFromLibraryV1)");
    expect(face).toContain('source={{ uri: ready.uri }}');
    expect(face).toContain('selected={presentationReader}');
    expect(face).toContain('accessibilityState={{ disabled: true }}');
    expect(face).toContain('서버 분석은 시작하지 않습니다');
    expect(face).not.toContain('FormData');
    expect(face).not.toContain('fetch(');
    expect(face).not.toContain('SecureStore');
  });
});
