import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function repo(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('Mobile Push registration structure', () => {
  it('keeps startup sync no-prompt and explicit permission request behind the My action', async () => {
    const root = await repo('apps/mobile/src/app/_layout.tsx');
    const native = await repo('apps/mobile/src/core/push/native-mobile-push-service.ts');
    const my = await repo('apps/mobile/src/features/my/MyPushNotifications.tsx');

    expect(root).toContain('syncEnabledNoPrompt');
    expect(root).not.toContain('requestPermissionsAsync');
    expect(native).toContain('requestPermissionsAsync');
    expect(native).toContain('getExpoPushTokenAsync');
    expect(my).toContain('알림 허용 및 기기 등록');
    expect(my).toContain('자동 발송 시점과 빈도는 아직 적용하지 않습니다');
  });

  it('pins Expo Notifications as a native plugin without inventing an EAS project id', async () => {
    const packageJson = JSON.parse(await repo('apps/mobile/package.json'));
    const appJson = JSON.parse(await repo('apps/mobile/app.json'));

    expect(packageJson.dependencies['expo-notifications']).toBe('~57.0.21');
    expect(packageJson.dependencies['expo-application']).toBe('~57.0.3');
    expect(appJson.expo.plugins).toContain('expo-notifications');
    expect(appJson.expo.extra?.eas?.projectId).toBeUndefined();
    const runtimeConfig = await repo('apps/mobile/src/core/config/mobile-runtime-config.ts');
    expect(runtimeConfig).toContain('EXPO_PUBLIC_EAS_PROJECT_ID');
  });

  it('revokes on logout and only preserves enabled preference for explicit subject switching', async () => {
    const auth = await repo('apps/mobile/src/features/my/use-mobile-member-auth.tsx');

    expect(auth).toContain('await nativeMobilePushServiceV1.prepareForSubjectChange();');
    expect(auth).toContain('await nativeMobilePushServiceV1.disable();');
    expect(auth).toContain('await nativeMobileRuntimeV1.memberSession.signOut();');
  });

  it('removes the stale pending notification setting and preserves send-policy blockers', async () => {
    const components = await repo('apps/mobile/src/features/my/MyComponents.tsx');
    const readme = await repo('apps/mobile/README.md');

    expect(components).not.toContain("'알림 설정'");
    expect(readme).toContain('SRC-31 / SRC-32');
    expect(readme).not.toContain('- Push;');
  });
});
