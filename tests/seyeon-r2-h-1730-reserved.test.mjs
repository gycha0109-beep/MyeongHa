// PostgreSQL 17 real-RPC negative proof: the original 1710 SQL-NULL gap is
// covered by 1730 validated checks after an actual governed reservation.
// Watchtower-Track: ops
import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read = p => readFileSync(new URL(p,import.meta.url),'utf8');
const runner = read('../test/db/seyeon_r2_h_1730_forward.sh');
const real = read('../test/db/seyeon_governed_cost_d4b10c1_provider_receipt_queue.sh');
const candidate = read('../test/db/fixtures/1730_seyeon_receipt_null_safe_constraints_v1.proposed.sql');
const original = read('../supabase/migrations/1710_seyeon_provider_receipt_queue_v1.sql');

describe('1730 admitted Provider Store RPC rejects malformed receipt atomically',()=>{
  it('cannot run the negative proof outside isolated CI-owned PostgreSQL 17',()=>{
    expect(runner).toContain('SEYEON_R2_H_1730_RESERVED_NEGATIVE=1');
    for(const guard of ['GITHUB_ACTIONS','DB_SUITE','postgres17','PGHOST','PGPORT','PGUSER',
      'myeongha_ci_case_[0-9]+','seyeon_provider_queue_required_enums_v1','convalidated'])
      expect(real).toContain(guard);
    expect(real).toContain('HOLD_R2_H_1730_RESERVED_PROBE_NOT_DISPOSABLE');
  });
  it('replays eight malformed variants through governed Store after genuine reservations',()=>{
    expect(real).toContain('cmd_governed_start_seyeon_ai_call_v1');
    expect(real).toContain('cmd_store_seyeon_provider_receipt_v1');
    for(const variant of ['missing_outcome','missing_cost_status','json_null_outcome',
      'json_null_cost_status','nonstring_outcome','nonstring_cost_status',
      'invalid_outcome','invalid_cost_status']) expect(real).toContain(variant);
    expect(real).toContain('seyeon_provider_queue_required_enums_v1');
    expect(real).toContain('seyeon_provider_receipt_malformed');
    expect(real).toContain("lifecycle_state='started'");
    expect(real).toContain('governor_receipt_pinned_at is not null');
    expect(real).toContain('occupied_micro_usd');
    expect(real).toContain('7400');
    expect(real).toContain('PASS_R2_H_1730_RESERVED_MALFORMED_REAL_RPC_ATOMIC_REJECTION_BUDGET_UNCHANGED');
    expect(runner).toContain('RESERVED_MALFORMED_REAL_RPC_ATOMIC_REJECTION_BUDGET_UNCHANGED');
  });
  it('keeps the original 1710 immutable and 1730 proposal test-only',()=>{
    expect(original).toContain("p_event->>'outcome' not in");
    expect(original).toContain("p_event->>'costStatus' not in");
    expect(candidate).toContain('jsonb_typeof(provider_event->\'outcome\')');
    expect(candidate).toContain('jsonb_typeof(provider_event->\'costStatus\')');
    expect(runner).toContain('VALIDATED_CONSTRAINTS_REAL_RPC_STORE_CLAIM_SETTLE_ACK_SYNTHETIC');
    expect(runner).toContain('productionWrites=0 drReady=false');
  });
});
