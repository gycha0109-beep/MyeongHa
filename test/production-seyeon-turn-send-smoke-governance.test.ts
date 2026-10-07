import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Production Seyeon turn smoke contract', () => {
  it('verifies live turn, exact replay, authoritative reread, and re-auth persistence without logging answer content', async () => {
    const source = await readFile(
      new URL('../scripts/verify-production-seyeon-turn-send.mjs', import.meta.url),
      'utf8',
    );
    expect(source).toContain("const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app'");
    expect(source).toContain("body: JSON.stringify({ characterId: 'seyeon' })");
    expect(source).toContain('/turns');
    expect(source).toContain('const clientTurnId = randomUUID()');
    expect(source).toContain('!replay.replayed');
    expect(source).toContain('assertCommittedTurn(firstRead, first, TURN_TEXT');
    expect(source).toContain('const secondSession = await acquireProductionMemberSmokeSession()');
    expect(source).toContain('assertCommittedTurn(secondRead, first, TURN_TEXT');
    expect(source).not.toContain('console.log(first.assistantText');
    expect(source).not.toContain('console.log(replay.assistantText');
    expect(source).toContain('assistantContentLogged=false');
  });
});
