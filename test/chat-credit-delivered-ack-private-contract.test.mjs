// Watchtower-Track: commerce-payment
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync(new URL('../supabase/migrations/20261027125500_chat_credit_delivered_ack_private_v1.sql',import.meta.url),'utf8');

describe('private ten-credit delivery acknowledgement SQL authority',()=>{
  it('binds the actual canonical Member/Thread/Turn/Attempt/Assistant/Reservation',()=>{
    for (const guard of [
      'public.assert_myeongha_subject_context_v1(p_subject_id)',
      "s.kind='member' and s.status='active'",
      'r.client_turn_id=p_client_turn_id',
      'r.required_credits=10',
      't.client_turn_id=p_client_turn_id::text',
      "t.state='delivered' and t.committed_at is not null",
      't.delivered_at is not null',
      'a.committed_message_id=p_assistant_message_id',
      "m.sender_type='character'",
      'm.redacted_at is null',
    ]) expect(sql).toContain(guard);
  });
  it('requires actual first-positive receipt ACK before settling protected SeYeon turns',()=>{
    expect(sql).toContain("a.seyeon_personal_source_pin_jsonb ? 'positiveProof'");
    expect(sql).toContain("to_jsonb(a)->>'seyeon_positive_delivery_received_at'");
    expect(sql).toContain("v_credits<>10");
    expect(sql).toContain('public.internal_cmd_chat_credit_finalize_v1(');
    expect(sql).toContain('p_subject_id,p_reservation_id,true,p_committed_turn_id');
  });
  it('does not authorize an unmounted direct API, browser or service role',()=>{
    expect(sql).toContain('revoke all on function public.internal_cmd_chat_credit_ack_delivered_v1(');
    expect(sql).toContain('from public,anon,authenticated,service_role,myeongha_api_executor;');
    expect(sql).not.toMatch(/grant\s+execute\s+on\s+function/i);
  });
});
