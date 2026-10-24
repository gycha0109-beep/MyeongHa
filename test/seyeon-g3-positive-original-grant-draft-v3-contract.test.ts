// Watchtower-Track: security
// Offline source-shape regression ONLY. This does NOT run/install the Owner SQL,
// prove PG17 concurrency, grant EXECUTE, or authorize a private/paid first Reply.
// The candidate remains in the unmerged #2422 Draft, outside supabase/migrations.
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const CANDIDATE =
  'docs/security/sql-drafts/20261023_seyeon_positive_g3_registry_locked_first_reveal_candidate.sql';
const BASELINE =
  'supabase/migrations/20261021183000_seyeon_positive_first_memory_locked_reveal_v1.sql';
const NAME='qry_seyeon_positive_first_memory_locked_reveal_v3';
const SIG=NAME+'(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)';
const read=(path:string)=>readFileSync(path,'utf8');

describe('§61 S5/G3 SOURCE ONLY original Memory first Reveal candidate',()=>{
  it('contains exactly one 8-argument SQL function and one intact transaction',()=>{
    const sql=read(CANDIDATE);
    expect(sql).toContain('SOURCE CANDIDATE ONLY');
    expect(sql).toMatch(/^begin;$/m);
    expect(sql.match(/^commit;$/gm)).toHaveLength(1);
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
    expect(sql.match(/\$positive_reveal\$;/g)).toHaveLength(1);
    expect(sql).toContain('create function public.'+NAME+'(');
    expect(sql).toContain('p_expected_user_message_id uuid');
    expect(sql).toContain('p_expected_assistant_message_id uuid');
    expect(sql).toContain('p_expected_post_turn_outbox_event_id uuid');
    expect(sql).toContain('p_expected_client_turn_id text');
    expect(sql).toContain(SIG);
    expect(sql).not.toContain(NAME+'(uuid,uuid,uuid,uuid)');
    expect(sql).not.toContain(NAME+'(uuid,uuid,uuid,uuid,uuid,uuid,uuid)');
    expect(sql).toContain("and t.client_turn_id=p_expected_client_turn_id");
  });

  it('enforces fresh first-send state, actual Grant and current type/Outbox locks',()=>{
    const sql=read(CANDIDATE);
    expect(sql).toContain("and t.state='committed'");
    expect(sql).toContain('and t.committed_at is not null');
    // The first private send is an exclusive, one-shot Turn transition,
    // committed only after Node's same-transaction direct socket handoff.
    expect(sql).toContain('for update of t');
    expect(sql).toContain("set state='delivered'");
    expect(sql).toContain("delivered_at=clock_timestamp()");
    expect(sql).toContain("and delivered_turn.delivered_at is null");
    expect(sql).toContain('if not found then return; end if;');
    expect(sql).not.toContain("t.state in ('committed','delivered')");
    expect(sql).toContain("a.seyeon_personal_source_pin_jsonb->'positiveProof'");
    expect(sql).toContain("a.validation_result_jsonb->'personalRecordProvenance'");
    expect(sql).toContain("and reg.enabled");
    expect(sql).toContain('for share of reg;');
    expect(sql).toContain("and g.revoked_at is null");
    expect(sql).toContain("and m.revoked_at is null");
    expect(sql).toContain('for share of g,m;');
    expect(sql).toContain('where oe.id=p_expected_post_turn_outbox_event_id');
    expect(sql).toContain('for share of oe,original_user,original_attempt;');
    expect(sql).toContain("and original_attempt.committed_message_id=p_expected_assistant_message_id");
    expect(sql).toContain("and msg.body_text=a.generated_body_text");
  });

  it('preserves reviewed v1 source separate and forbids public or API EXECUTE',()=>{
    const source=read(CANDIDATE);
    const reviewed=read(BASELINE);
    expect(reviewed).toContain('qry_seyeon_positive_first_memory_locked_reveal_v1');
    expect(reviewed).not.toContain(NAME);
    expect(source).toContain('revoke all on function public.'+NAME+'(');
    expect(source).toContain("where rolname in ('anon','authenticated','service_role')");
    expect(source).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.[\s\S]*?to\s+myeongha_api_executor/i);
    expect(source).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.[\s\S]*?to\s+authenticated/i);
  });
});
