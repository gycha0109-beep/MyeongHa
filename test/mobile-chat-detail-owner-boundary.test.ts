import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Mobile Chat detail closes previous-Subject transcript on credential switch', () => {
  it('immediately hides the prior Thread after a verified subject change', async () => {
    const screen = await readFile(new URL('../apps/mobile/src/app/(tabs)/chat/[threadId].tsx', import.meta.url), 'utf8');
    expect(screen).toContain('useMobileChatThreadV1(threadId)');
    expect(screen).toContain('subscribeMobileSubjectCredentialChangesV1(() => {');
    expect(screen).toContain('setOwnerChanged(true)');
    expect(screen).toContain("router.replace('/chat')");
    expect(screen).toContain('return unsubscribe');
    expect(screen).toContain('if (ownerChanged) {');
    expect(screen.indexOf('if (ownerChanged) {')).toBeLessThan(screen.indexOf('const threadContent = ('));
    expect(screen).toContain('계정이 바뀌어 이전 대화방을 닫았습니다');
    expect(screen).toContain('ChatReadMessages snapshot={snapshot}');
    expect(screen).toContain('ChatComposer');
    expect(screen).not.toContain('window.location');
  });

  it('keeps the real transcript and saved draft behind their original server and Member gates', async () => {
    const [hook, service, pending] = await Promise.all([
      readFile(new URL('../apps/mobile/src/features/chat/use-mobile-chat-thread.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/chat/mobile-chat-read-service.ts', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/chat/mobile-chat-pending-turn-store.ts', import.meta.url), 'utf8'),
    ]);
    expect(hook).toContain('current.characterId !== \'seyeon\'');
    expect(service).toContain('withMemberBearer');
    expect(pending).toContain('if (data.ownerId !== ownerId) return null');
    expect(pending).toContain('if (meta.ownerId !== ownerId) return');
  });
});
