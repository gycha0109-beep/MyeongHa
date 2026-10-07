import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Seyeon Web turn-send wiring', () => {
  it('connects the approved Member send route and re-reads authoritative thread state', async () => {
    const source = await readFile(
      new URL('../apps/web/chat-runtime-client.js', import.meta.url),
      'utf8',
    );
    expect(source).toContain('/turns');
    expect(source).toContain('clientTurnId: crypto.randomUUID()');
    expect(source).toContain('await loadRoomState()');
    expect(source).toContain("authoritativeCharacterId !== 'seyeon'");
    expect(source).not.toContain('웹 메시지 전송은 아직 운영 연결 전');
  });
});
