import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const decision = read('../docs/operations/SEYEON_R2_G_OWNER_RISK_ACCEPTANCE_20261016.md');
const handoff = read('../docs/operations/SEYEON_R2_OWNER_DECISION_HANDOFF_20261015.md');
const test1730 = read('../test/db/seyeon_r2_h_1730_forward.sh');
const original1710 = read('../supabase/migrations/1710_seyeon_provider_receipt_queue_v1.sql');
const observer = read('../scripts/operations/verify-seyeon-r2-g-lineage.mjs');

describe('R2-G historical audit risk acceptance and independent release gates', () => {
  it('closes only the historical actor investigation, without fabricating provenance', () => {
    expect(decision).toContain('R2_G_HISTORICAL_PROVENANCE_AUDIT = CLOSED_RISK_ACCEPTED');
    expect(decision).toContain('R2_G_HISTORICAL_ACTOR_BLOCKS_DEVELOPMENT = false');
    expect(decision).toContain('4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894');
    expect(decision).toContain('originEstablished=true');
    expect(handoff).toContain('SEYEON_R2_G_OWNER_RISK_ACCEPTANCE_20261016.md');
    expect(observer).toContain('CLOSED_R2_G_HISTORICAL_ACTOR_AUDIT_RISK_ACCEPTED');
    expect(observer).toContain('fullMigrationLineageParityProven:false');
    expect(observer).toContain('authorizedForProduction:false');
  });
  it('retains distinct Production, DR and paid/public deployment barriers', () => {
    for (const term of [
      'authorizedForProduction=false',
      'drReady=false',
      'paidAi=false',
      'publicReader=false',
      'migration repair',
      '1520',
      '1720',
    ]) expect(decision).toContain(term);
  });
  it('tests the 1730 installed constraints on positive real PostgreSQL RPCs', () => {
    expect(test1730).toContain('NOT_DISPOSABLE');
    expect(test1730).toContain('SOURCE_1730_DRIFT');
    expect(test1730).toContain('seyeon_governed_cost_d4b10c1_provider_receipt_queue.sh');
    expect(test1730).toContain('VALIDATED_CONSTRAINTS_REAL_RPC_STORE_CLAIM_SETTLE_ACK_SYNTHETIC');
    expect(test1730).toContain('syntheticReservedReceiptE2E=true');
    expect(test1730).toContain('actualFundedE2E=false');
    expect(original1710).toContain("p_event->>'outcome' not in");
  });
});
