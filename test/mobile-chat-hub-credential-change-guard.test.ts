import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Chat Hub verified Subject change gates', () => {
  it('subscribes only while focused and immediately removes stale Member privileges', async () => {
    const hook = await readFile(new URL('../apps/mobile/src/features/chat/use-mobile-chat-open.tsx', import.meta.url), 'utf8');
    expect(hook).toContain('subscribeMobileSubjectCredentialChangesV1(() => {');
    expect(hook).toContain('void refreshAccess()');
    expect(hook).toContain('unsubscribe()');
    expect(hook).toContain("access: 'checking' as const,");
    expect(hook).toContain('openingCharacterId: null,');
    expect(hook).toContain("if (!focused.current || state.access !== 'member' || state.openingCharacterId !== null) return null");
    expect(hook).toContain("mobileChatOpenServiceV1.open(characterId)");
    expect(hook).toContain('nativeMobileRuntimeV1.memberSession.read()');
  });

  it('ignores both success and failure from an old login or blurred screen', async () => {
    const [hook, screen] = await Promise.all([
      readFile(new URL('../apps/mobile/src/features/chat/use-mobile-chat-open.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/app/(tabs)/chat/index.tsx', import.meta.url), 'utf8'),
    ]);
    expect(hook).toContain('const epoch = ++requestEpoch.current');
    expect(hook.split('if (!focused.current || epoch !== requestEpoch.current) return null').length - 1)
      .toBe(3);
    expect(hook).toContain('requestEpoch.current += 1');
    expect(hook).toContain('return result');
    expect(screen).toContain('if (result !== null) router.push');
    expect(screen).toContain("const canOpen = state.access === 'member'");
    expect(screen).toContain('disabled={disabled}');
    expect(screen).not.toContain('localStorage');
  });
});
