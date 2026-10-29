import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Seyeon Web turn-send wiring', () => {
  it('connects the approved Member send route and displays only the receipt-ACKed first reply', async () => {
    const source = await readFile(
      new URL('../apps/web/chat-runtime-client.js', import.meta.url),
      'utf8',
    );
    expect(source).toContain('sendSeyeonBrowserTurnWithReceiptV1');
    const shared = await readFile(new URL('../packages/api-client/src/chat.ts', import.meta.url), 'utf8');
    expect(shared).toContain('/turns');
    expect(shared).toContain('/api/chat/delivery-receipts/');
    expect(source).toContain('clientTurnId: pendingTurn.clientTurnId');
    expect(source).toContain('clientTurnId: crypto.randomUUID()');
    const send = source.slice(source.indexOf('async function sendTurn(message)'), source.indexOf('function submitTurn(event)'));
    expect(send).toContain('acknowledgedReply = await sendSeyeonBrowserTurnWithReceiptV1');
    expect(send).toContain('renderAcknowledgedSeyeonFirstReply(acknowledgedReply)');
    expect(send).not.toContain('await loadRoomState()');
    expect(send).toContain('currentBearer.token !== activeBearer.token');
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
    expect(source).toContain('clearPendingTurn(pendingTurn.clientTurnId, submittedThreadId)');
    expect(source).toContain('sessionStorage.removeItem(pendingTurnKey(targetThreadId))');
    expect(source).toContain('완료되지 않은 전송 문장을 복원했습니다');
  });
});
