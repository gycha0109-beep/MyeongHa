// G0 follow-up issuance is a DB-owned first-receipt operation.
// No paid provider or browser-owned reply bytes are involved in these checks.
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';

const read=(name:string)=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

describe('G0 committed follow-up receipt recovery contract',()=>{
  const sql=read('scripts/operations/seyeon-security-s0/production-27-g0-committed-followup-receipt-20261105.sql');
  const ownerLockFix=read('scripts/operations/seyeon-security-s0/production-28-g0-followup-owner-original-user-lock-20261105.sql');
  const live=read('apps/api/src/seyeon-first-positive-memory-fetch-delivery-v1.ts');
  const recovery=read('apps/api/src/seyeon-unissued-zero-reply-recovery-v1.ts');
  const ui=read('apps/web/chat-runtime-client.js');
  const history=read('apps/api/src/chat-read-http.ts');

  it('keeps existing first-turn issuer and positive-memory receipt untouched',()=>{
    expect(sql).toContain('public.cmd_issue_seyeon_zero_source_first_reply_v1(');
    expect(sql).toContain('public.cmd_issue_seyeon_zero_source_followup_reply_v1(');
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function/iu);
    expect(sql).not.toMatch(/\bdisable\s+trigger\b/iu);
    expect(sql).not.toMatch(/\bupdate\s+public\.record_access_grants\b/iu);
    expect(sql).toContain('set local lock_timeout');
    expect(sql.trimEnd()).toMatch(/commit;$/iu);
  });

  it('pins original owner, exact committed answer, guard and current source before issue',()=>{
    expect(sql).toContain('public.assert_myeongha_subject_context_v1(p_subject_id)');
    expect(sql).toContain('public.assert_seyeon_chat_thread_runtime_v1(p_subject_id,p_thread_id)');
    expect(sql).toContain("and t.state='committed'");
    expect(sql).toContain("and a.state='committed'");
    expect(sql).toContain("a.validation_result_jsonb->'passed'='true'::jsonb");
    expect(sql).toContain('a.validation_result_jsonb->\'personalRecordProvenance\'');
    expect(sql).toContain('a.seyeon_personal_source_pin_jsonb');
    expect(sql).toContain("v_selection->'selectedSources' is distinct from '[]'::jsonb");
    expect(sql).toContain("v_selection->'selectedUnpinnedDerivedSources' is distinct from '[]'::jsonb");
    expect(sql).toContain('seyeon_private.assert_current_original_assistant_lineage_v1(');
    expect(sql).toContain("v_previous_ids[v_i+1],'user');");
    expect(sql).not.toContain('perform seyeon_private.assert_current_original_member_user_message_v1(');
    expect(sql).toContain('seyeon_private.lock_g0_original_message_v1(');
    expect(sql).toContain('a.seyeon_positive_delivery_issued_at is null');
    expect(sql).toContain('a.seyeon_positive_delivery_received_at is null');
    expect(sql).toContain('a.seyeon_positive_delivery_receipt_hash is null');
    expect(sql).toContain("'seyeon-positive-http-receipt-v1'");
  });

  it('does not introduce a privileged public role or arbitrary historical replay',()=>{
    expect(sql).toContain('from public,anon,authenticated,service_role');
    expect(sql).toContain('from myeongha_api_executor;');
    expect(sql).toContain('to myeongha_api_executor;');
    expect(sql).toContain("and older.state='delivered'");
    expect(sql).toContain('and older.delivered_at is not null');
    expect(sql).toContain("if v_matches<>1 then raise exception");
    expect(sql).toContain('p_user_text');
    expect(sql).toContain("and t.delivered_at is null");
    expect(sql).toContain('and a.seyeon_positive_delivery_issued_at is null');
  });

  it('keeps the production postgres owner within the existing protected User lock',()=>{
    expect(ownerLockFix).toContain('create or replace function public.cmd_issue_seyeon_zero_source_followup_reply_v1(');
    expect(ownerLockFix).toContain("v_previous_ids[v_i+1],'user');");
    expect(ownerLockFix).toContain('seyeon_private.lock_g0_original_message_v1(');
    expect(ownerLockFix.split('do $postflight$')[0]).not.toContain('perform seyeon_private.assert_current_original_member_user_message_v1(');
    expect(ownerLockFix).toContain("not has_function_privilege('myeongha_api_executor',p.oid,'EXECUTE')");
    expect(ownerLockFix).not.toMatch(/\bgrant\s+execute\b/iu);
    expect(ownerLockFix).not.toMatch(/\bdisable\s+trigger\b/iu);
    expect(ownerLockFix.trimEnd()).toMatch(/commit;$/iu);
  });

  it('routes recovery before any model execution and preserves original messages',()=>{
    expect(live.indexOf('recoverSeyeonUnissuedZeroReplyV1(')).toBeGreaterThan(0);
    expect(live.indexOf('recoverSeyeonUnissuedZeroReplyV1('))
      .toBeLessThan(live.indexOf('input.runtime.run('));
    expect(live).toContain('zeroSource ? SEYEON_G0_RECEIPT_ISSUER_V1');
    expect(recovery).toContain('from public.cmd_recover_seyeon_unissued_g0_reply_v1');
    expect(recovery).not.toContain('provider');
    expect(history).toContain('qry_chat_thread_owner_visible_history_v1');
    expect(ui).toContain("message.turnState === 'committed'");
    expect(ui).toContain('확정된 답변 받기');
    expect(ui).toContain('refreshed.turnState !== message.turnState');
  });
});
