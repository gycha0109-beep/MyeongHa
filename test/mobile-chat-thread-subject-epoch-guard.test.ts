import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('mobile Chat detail prevents old-subject async send effects', () => {
  it('invalidates local draft/retry and saved-turn restoration upon verified Subject changes', async () => {
    const hook = await readFile(new URL('../apps/mobile/src/features/chat/use-mobile-chat-thread.tsx', import.meta.url), 'utf8');
    expect(hook).toContain('subscribeMobileSubjectCredentialChangesV1(() => {');
    expect(hook).toContain('subjectEpoch.current += 1');
    expect(hook).toContain('pendingTurn.current = null');
    expect(hook).toContain("setDraft('')");
    expect(hook).toContain('setSendStatus(null)');
    expect(hook).toContain('unsubscribe()');
    expect(hook).toContain('setSnapshot(controller.reset())');
    expect(hook).toContain('if (!active || epoch !== subjectEpoch.current || saved === null) return');
    expect(hook).toContain('if (active && epoch === subjectEpoch.current) setSnapshot(next)');
  });

  it('rechecks focus and owner epoch around network send, cursored re-read and completion', async () => {
    const hook = await readFile(new URL('../apps/mobile/src/features/chat/use-mobile-chat-thread.tsx', import.meta.url), 'utf8');
    const send = hook.slice(hook.indexOf('const send = useCallback'));
    expect(send).toContain('if (!focused.current || sendingRef.current) return');
    expect(send).toContain('const stillCurrent = () => focused.current && epoch === subjectEpoch.current');
    expect(send).toContain('const member = await nativeMobileRuntimeV1.memberSession.read()');
    expect(send).toContain('mobileChatPendingTurnStoreV1.write(threadId, ownerId, request)');
    expect(send).toContain('mobileChatTurnSendServiceV1.send({');
    expect(send).toContain('mobileChatPendingTurnStoreV1.clear(threadId, ownerId)');
    expect(send).toContain('sendOwnerId = ownerId');
    expect(send).toContain('mobileChatPendingTurnStoreV1.clear(threadId, sendOwnerId)');
    expect(send).not.toContain('memberSession.read().catch(() => null)');
    expect(send).toContain('if (!stillCurrent()) return');
    expect(send.split('if (!stillCurrent()) return').length - 1).toBeGreaterThanOrEqual(7);
    expect(send).toContain('if (stillCurrent()) setSendStatus(sendErrorMessage(error))');
    expect(send).toContain("current.characterId !== 'seyeon'");
    expect(hook).not.toContain('assistantText:');
  });

  it('keeps old-owner pending turn storage isolated and Chat detail closing on credentials', async () => {
    const [pending, screen, service] = await Promise.all([
      readFile(new URL('../apps/mobile/src/features/chat/mobile-chat-pending-turn-store.ts', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/app/(tabs)/chat/[threadId].tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/chat/mobile-chat-turn-send-service.ts', import.meta.url), 'utf8'),
    ]);
    // The existing detail OWNER-switch PR is independent until merged. This
    // guard is required even when a render route is closing.
    expect(pending).toContain('if (data.ownerId !== ownerId) return null');
    expect(pending).toContain('if (meta.ownerId !== ownerId) return');
    expect(service).toContain("turn.characterId !== 'seyeon'");
    expect(screen).toContain('useMobileChatThreadV1(threadId)');
  });
});
