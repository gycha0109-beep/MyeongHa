import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function source(path: string) {
  return readFile(new URL('../' + path, import.meta.url), 'utf8');
}

describe('Android device feedback: public discovery and gated actions', () => {
  it('presents all nine canonical characters even when guest, without opening member chat', async () => {
    const [screen, roster, service] = await Promise.all([
      source('apps/mobile/src/app/(tabs)/chat/index.tsx'),
      source('apps/mobile/src/features/chat/chat-launch-roster.ts'),
      source('apps/mobile/src/features/chat/mobile-chat-open-service.ts'),
    ]);
    expect(roster.match(/characterId: '/gu)).toHaveLength(9);
    const renderedListAt = screen.indexOf('MOBILE_CHAT_LAUNCH_ROSTER_V1.map');
    const guestLoginAt = screen.indexOf("state.access === 'guest'");
    expect(guestLoginAt).toBeGreaterThan(0);
    expect(renderedListAt).toBeGreaterThan(guestLoginAt);
    expect(screen).toContain("const canOpen = state.access === 'member'");
    expect(screen).toContain("const disabled = !canOpen");
    expect(screen).toContain('로그인 후 대화');
    expect(service).toContain('withMemberBearer');
  });

  it('does not condition displaying My member login on profile service success', async () => {
    const [screen, auth] = await Promise.all([
      source('apps/mobile/src/app/(tabs)/my/index.tsx'),
      source('apps/mobile/src/features/my/MyComponents.tsx'),
    ]);
    expect(screen).toContain('<MyMemberAuthCard');
    expect(screen).not.toContain("state.profile.kind === 'ready' ? (\n        <MyMemberAuthCard");
    expect(screen).toContain('memberSessionPresent');
    expect(screen).toContain('nativeMobileRuntimeV1.memberSession.read()');
    expect(auth).toContain('기존 계정으로 로그인');
    expect(auth).toContain('secureTextEntry');
  });

  it('defers Add Person and its target list from My without deleting authority APIs', async () => {
    const [screen, service] = await Promise.all([
      source('apps/mobile/src/app/(tabs)/my/index.tsx'),
      source('apps/mobile/src/features/my/mobile-my-service.ts'),
    ]);
    expect(screen).not.toContain('MyTargetPersonCreateCard');
    expect(screen).not.toContain('MyTargetPersonsSection');
    expect(service).toContain('createTargetPersonV1');
  });

  it('uses an actual native selfie camera and not an OEM camera picker', async () => {
    const [face, camera, app, pkg, lock] = await Promise.all([
      source('apps/mobile/src/app/(tabs)/reading/face.tsx'),
      source('apps/mobile/src/platform/media/MobileFrontCameraV1.tsx'),
      source('apps/mobile/app.json'),
      source('apps/mobile/package.json'),
      source('package-lock.json'),
    ]);
    expect(face).toContain('<MobileFrontCameraV1');
    expect(face).not.toContain('pickMobileFaceMediaFromCameraV1');
    expect(camera).toContain('facing="front"');
    expect(camera).toContain('mode="picture"');
    expect(camera).toContain('onCameraReady');
    expect(camera).toContain('takePictureAsync');
    expect(camera).toContain('exif: false');
    expect(camera).toContain('normalizeMobileFaceMediaAssetV1');
    expect(camera).not.toContain('fetch(');
    expect(camera).not.toContain('FormData');
    expect(app).toContain('"expo-camera"');
    expect(app).toContain('"recordAudioAndroid": false');
    expect(JSON.parse(pkg).dependencies['expo-camera']).toBe('~57.0.3');
    expect(JSON.parse(lock).packages['node_modules/expo-camera'].version).toBe('57.0.4');
  });

  it('preserves guest Saju calculation separate from paid Reader access', async () => {
    const [subject, birth, saju] = await Promise.all([
      source('apps/mobile/src/core/session/mobile-subject-session.ts'),
      source('apps/mobile/src/features/birth/mobile-birth-service.ts'),
      source('apps/mobile/src/features/saju/mobile-saju-service.ts'),
    ]);
    expect(subject).toContain('if (member === null)');
    expect(subject).toContain('return withGuestBearer(operation)');
    expect(birth).toContain('withActiveBearer');
    expect(saju).toContain('withActiveBearer');
  });
});
