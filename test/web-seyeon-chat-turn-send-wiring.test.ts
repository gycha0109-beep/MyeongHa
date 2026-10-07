import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Seyeon Web turn-send wiring', () => {
  it('connects the approved Member send route and re-reads authoritative thread state', async () => {
    const source = await readFile(
      new URL('../apps/web/chat-runtime-client.js', import.meta.url),
      'utf8',
    );
    expect(source).toContain('/turns');
    expect(source).toContain('clientTurnId: pendingTurn.clientTurnId');
    expect(source).not.toContain('clientTurnId: crypto.randomUUID()');
    expect(source).toContain('const rereadSucceeded = await loadRoomState()');
    expect(source).toContain("if (!rereadSucceeded) throw new Error('AUTHORITATIVE_REREAD_FAILED')");
    expect(source).toContain("authoritativeCharacterId !== 'seyeon'");
    expect(source).not.toContain('웹 메시지 전송은 아직 운영 연결 전');
  });

  it('persists one logical turn id across retries and blocks duplicate submit while in flight', async () => {
    const source = await readFile(
      new URL('../apps/web/chat-runtime-client.js', import.meta.url),
      'utf8',
    );
    expect(source).toContain('myeongha:chat:pending-turn:v1:');
    expect(source).toContain('if (existing?.text === message) return existing');
    expect(source).toContain('sessionStorage.setItem(pendingTurnKey(threadId), JSON.stringify(pendingTurn))');
    expect(source).toContain('if (sendingTurn) return');
    expect(source).toContain('sendingTurn = true');
    expect(source).toContain('sendingTurn = false');
    expect(source).toContain('clearPendingTurn(pendingTurn.clientTurnId)');
    expect(source).toContain('완료되지 않은 전송 문장을 복원했습니다');
  });
});
