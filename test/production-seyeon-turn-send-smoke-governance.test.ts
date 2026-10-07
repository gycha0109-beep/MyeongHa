import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Production Seyeon turn smoke contract', () => {
  it('keeps the live smoke explicitly governed and delegates provider access to the deployed server', async () => {
    const workflow = await readFile(
      new URL('../.github/workflows/production-seyeon-turn-send-smoke.yml', import.meta.url),
      'utf8',
    );
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('VERIFY_SEYEON_PRODUCTION_TURN');
    expect(workflow).toContain("branches:\n      - main");
    expect(workflow).toContain('.github/production-seyeon-turn-send-smoke.trigger');
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('MYEONGHA_PRODUCTION_MEMBER_EMAIL');
    expect(workflow).toContain('MYEONGHA_PRODUCTION_MEMBER_PASSWORD');
    expect(workflow).toContain('MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID');
    expect(workflow).not.toContain('OPENAI_API_KEY');
    expect(workflow).not.toContain('SUPABASE_DB_PASSWORD');
  });

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
