import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('G1-B2 zero-only DB durability boundary', () => {
  it('requires both server zero proof and exact final selection in context-ready persistence input', async () => {
    const runtime = await readFile(new URL(
      '../apps/api/src/seyeon-production-chat-execution-v1.ts', import.meta.url,
    ), 'utf8');
    const proof = runtime.indexOf('const personalRecordProof = createSeyeonAttemptZeroPersonalProofV1({');
    const selection = runtime.indexOf('const exactModelPersonalSources = selectSeyeonExactModelPersonalSourcesV1({');
    const store = runtime.indexOf('await input.persistencePort.markContextReady({');
    const model = runtime.indexOf('const runtime = await runSeyeonCharacterTurnV2({');
    expect(proof).toBeGreaterThan(-1);
    expect(selection).toBeGreaterThan(proof);
    expect(store).toBeGreaterThan(selection);
    expect(model).toBeGreaterThan(store);
    expect(runtime.slice(store, model)).toContain('zeroPersonalProof: personalRecordProof');
    expect(runtime.slice(store, model)).toContain('exactModelSourceSelection: exactModelPersonalSources');
    const hold = runtime.lastIndexOf('assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1(', proof);
    expect(hold).toBeGreaterThan(-1);
    expect(hold).toBeLessThan(proof);
  });

  it('uses the narrow atomic SQL command, not the old three-argument context-ready entry', async () => {
    const pg = await readFile(new URL(
      '../apps/api/src/postgres-seyeon-production-chat-execution-v1.ts',
      import.meta.url,
    ), 'utf8');
    expect(pg).toContain('public.cmd_mark_seyeon_chat_context_ready_pinned_v1');
    expect(pg).not.toContain('public.cmd_mark_seyeon_chat_context_ready_runtime_v1');
    expect(pg).toContain('zeroProof: input.zeroPersonalProof');
    expect(pg).toContain('exactModelSourceSelection: input.exactModelSourceSelection');

    const sql = await readFile(new URL(
      '../supabase/migrations/1630_seyeon_zero_personal_source_pre_model_pin_v1.sql',
      import.meta.url,
    ), 'utf8');
    expect(sql).toContain('seyeon_personal_source_pin_jsonb');
    expect(sql).toContain('seyeon_personal_source_pinned_at');
    expect(sql).toContain('seyeon_source_pin_immutable');
    expect(sql).toContain('seyeon_commit_requires_original_zero_source_pin');
    expect(sql).toContain('public.cmd_mark_chat_turn_context_ready_v1(');
    expect(sql).toContain('revoke execute on function public.cmd_mark_seyeon_chat_context_ready_runtime_v1');
    expect(sql).toContain('myeongha_seyeon_chat_runtime_owner');
    expect(sql).toContain("v_selection -> 'selectedPersonalRecordCount' is distinct from '0'::jsonb");
    const root = await readFile(new URL(
      '../test/db/run_authority_core.sh', import.meta.url,
    ), 'utf8');
    expect(root).toContain('test/db/seyeon_zero_personal_source_pre_model_pin_v1.sql');
    // Text checks do not replace real PostgreSQL ACL/transition tests.
  });
});
