import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const code=readFileSync(new URL(
  '../apps/api/src/seyeon-first-positive-memory-fetch-delivery-v1.ts',
  import.meta.url),'utf8');
const sql=readFileSync(new URL(
  '../scripts/operations/seyeon-security-s0/production-20-recover-exact-failed-user-turn-20261102.sql',
  import.meta.url),'utf8');

describe('First Se-yeon failed User turn browser id loss recovery',()=>{
  it('only reconciles the exact prior committed User original under verified Subject',()=>{
    expect(sql).toContain('perform public.assert_myeongha_subject_context_v1(p_subject_id)');
    expect(sql).toContain('perform 1 from public.assert_seyeon_chat_thread_runtime_v1(p_subject_id,p_thread_id)');
    expect(sql).toContain('t.subject_id=p_subject_id and t.thread_id=p_thread_id');
    expect(sql).toContain("t.state='failed_retryable' and t.committed_attempt_id is null");
    expect(sql).toContain("m.turn_id=t.id and m.sender_type='user'");
    expect(sql).toContain('m.redacted_at is null and m.body_text=p_user_text');
    expect(sql).toContain('if v_matches is distinct from 1 then return null; end if;');
    expect(sql).not.toMatch(/\bdelete\s+from\b|\bupdate\s+public\.chat_turns\b/i);
  });
  it('keeps the original source, identity, ACL and receipt conditions intact',()=>{
    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path to 'pg_catalog','public'");
    expect(sql).toContain("to myeongha_api_executor");
    expect(sql).toContain("from anon");
    expect(sql).toContain("from authenticated");
    expect(sql).toContain("from service_role");
    expect(sql).toContain("has_schema_privilege('myeongha_seyeon_chat_runtime_owner','public','CREATE')");
    expect(sql).toMatch(/commit;\s*$/u);
  });
  it('reconciles before paid Model calls, and uses the SAME recovered ID for the receipt issuer',()=>{
    expect(code).toContain('RECOVER_FAILED_USER_RPC');
    expect(code).toContain("if(zeroSource){\n      stage='failed_turn_reconciliation'");
    expect(code).toContain("verifiedEvidence:preflight.verifiedEvidence");
    expect(code).toContain('[resolvedSubject.subjectId,preflight.threadId,preflight.text]');
    expect(code).toContain('if(recovered!==null)executionClientTurnId=recovered;');
    expect(code).toContain('clientTurnId:executionClientTurnId,text:preflight.text');
    expect(code).toContain('e.committedTurn.postTurnOutboxEventId,executionClientTurnId,receiptHash');
    expect(code).toContain('e.receivedTurn.committedTurn!==null||e.attempt.replayed');
    expect(code).toContain('e.committedTurn.replayed');
    expect(code).toContain('assertSeyeonZeroSourceHttpReceiptReadyV1(client)');
    expect(code).toContain('assertSeyeonG0OriginalLineageReadyV1(client)');
  });
});
