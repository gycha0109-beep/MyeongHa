import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const db=source('scripts/operations/seyeon-security-s0/production-21-explicit-stale-failed-turn-supersede-20261102.sql');
const handler=source('apps/api/src/seyeon-first-positive-memory-fetch-delivery-v1.ts');
const browser=source('apps/web/chat-runtime-client.js');
const transport=source('apps/web/chat-turn-receipt-client.js');
const g0=source('scripts/operations/seyeon-security-s0/production-22-ignore-abandoned-g0-history-20261102.sql');

describe('Se-yeon stale failed User turn differs from current draft',()=>{
  it('requires verified Subject and thread, fails closed for ambiguous or active Turns',()=>{
    expect(db).toContain('perform public.assert_myeongha_subject_context_v1(p_subject_id)');
    expect(db).toContain('perform 1 from public.assert_seyeon_chat_thread_runtime_v1(p_subject_id,p_thread_id)');
    expect(db).toContain('for update');
    expect(db).toContain("if v_count is distinct from 1 then return false;");
    expect(db).toContain("t.state='failed_retryable'");
    expect(db).toContain('t.committed_attempt_id is null and t.committed_at is null');
    expect(db).toContain("m.sender_type='user' and m.redacted_at is null");
    expect(db).toContain('v_old_text=p_new_text then return false');
    expect(db).toContain("a.state not in ('failed_retryable','failed_final')");
    expect(db).toContain("m.sender_type='character'");
    expect(db).toContain("public.ai_execution_logs");
    expect(db).toContain("set state='abandoned'");
    expect(db).not.toMatch(/\bdelete\s+from\s+public\./iu);
    expect(db).toMatch(/commit;\s*$/u);
  });
  it('releases no direct public mutation authority and restores its runtime owner',()=>{
    expect(db).toContain('security definer');
    expect(db).toContain("set search_path to 'pg_catalog','public'");
    expect(db).toContain('grant execute on function public.cmd_seyeon_supersede_stale_failed_turn_v1');
    expect(db).toContain('to myeongha_api_executor;');
    expect(db).toContain('from anon;');
    expect(db).toContain('from authenticated;');
    expect(db).toContain('from service_role;');
    expect(db).toContain('revoke create on schema public from myeongha_seyeon_chat_runtime_owner;');
  });
  it('only performs the mutation for a separately confirmed request, before normal new Turn execution',()=>{
    expect(handler).toContain("supersedeHeader!=='v1'||!zeroSource");
    expect(handler).toContain("if(recovered===null && supersedeHeader==='v1')");
    expect(handler).toContain('SUPERSEDE_FAILED_USER_RPC');
    expect(handler).toContain('[resolvedSubject.subjectId,preflight.threadId,preflight.text]');
    expect(handler.indexOf('if(recovered===null && supersedeHeader')).toBeLessThan(handler.indexOf("stage='model_execution'"));
    expect(handler).toContain("kind:'turn_in_flight',requestId:input.requestId");
    expect(handler).toContain("e.receivedTurn.committedTurn!==null||e.attempt.replayed");
    expect(handler).toContain('SEYEON_G0_RECEIPT_ISSUER_V1');
    expect(source('scripts/operations/seyeon-security-s0/production-27-g0-committed-followup-receipt-20261105.sql')).toContain('public.cmd_issue_seyeon_zero_source_first_reply_v1(');
  });
  it('excludes abandoned messages from BOTH exact G0 reader and the 12-key DB source Pin',()=>{
    expect(g0).toContain('qry_seyeon_g0_current_source_recent_messages_v1');
    expect(g0).toContain('cmd_mark_seyeon_chat_context_ready_pinned_v1');
    expect(g0).toContain('src.id=p_current_user_message_id');
    expect(g0).toContain('m.id::text=v_current_id');
    expect(g0).toContain("admitted_turn.state in ('committed','delivered')");
    expect(g0).toContain('admitted_turn.committed_attempt_id is not null');
    expect(g0).toContain('admitted_turn.committed_at is not null');
    expect(g0).toContain("position('v_selection_keys <> 12' in b)");
    expect(g0).toContain('revoke create on schema public from myeongha_seyeon_chat_runtime_owner');
    expect(g0).toMatch(/commit;\s*$/u);
  });
  it('the user confirms explicitly; header cannot be sent on unrelated routes',()=>{
    expect(browser).toContain('window.confirm(');
    expect(browser).toContain('supersedeFailed: true');
    expect(browser).toContain("error.code === 'TURN_IN_FLIGHT'");
    expect(transport).toContain("supersedeFailed = false");
    expect(transport).toContain("target.origin === new URL(origin).origin");
    expect(transport).toContain("options?.method === 'POST'");
    expect(transport).toContain("headers.set('X-MyeongHa-Seyeon-Explicit-Supersede', 'v1')");
  });
});
