import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '1050_commerce_verified_payment_evidence_persistence.sql',
  ),
  'utf8',
);
const runtime = readFileSync(
  join(
    process.cwd(),
    'apps',
    'api',
    'src',
    'commerce-verified-payment-evidence-persistence.ts',
  ),
  'utf8',
);

describe('commerce verified payment evidence persistence authority', () => {
  it('is a narrow internal Commerce SECURITY DEFINER command with no caller subject', () => {
    expect(migration).toMatch(
      /create or replace function public\.cmd_persist_verified_payment_evidence_v1[\s\S]*security definer[\s\S]*set search_path = pg_catalog, public/,
    );
    expect(migration).not.toContain('p_subject_id');
    expect(migration).not.toContain("set_config('myeongha.subject_id'");
    expect(migration).toMatch(
      /revoke all on function public\.cmd_persist_verified_payment_evidence_v1[\s\S]*from public;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.cmd_persist_verified_payment_evidence_v1[\s\S]*to myeongha_commerce_internal_executor;/,
    );
    expect(migration).toContain("ARRAY['anon','authenticated','service_role','myeongha_api_executor']");
  });

  it('locks Payment Attempt and Purchase Intent and accepts only handoff/replay provenance', () => {
    expect(migration).toMatch(
      /from public\.commerce_payment_attempts cpa[\s\S]*where cpa\.id = p_payment_attempt_id[\s\S]*for update;/,
    );
    expect(migration).toMatch(
      /from public\.purchase_intents pi[\s\S]*where pi\.id = v_attempt\.purchase_intent_id[\s\S]*for update;/,
    );
    expect(migration).toContain(
      "v_attempt.status not in ('handed_off', 'response_received')",
    );
    expect(migration).toContain("if v_attempt.status = 'response_received'");
    expect(migration).toContain("status = 'response_received'");
  });

  it('re-validates Purchase Intent v2 snapshot and pinned charge authority', () => {
    expect(migration).toContain('v_intent.offer_snapshot_jsonb');
    expect(migration).toContain("v_snapshot ->> 'productOfferId'");
    expect(migration).toContain("v_snapshot ->> 'externalProductId'");
    expect(migration).toContain('v_intent.expected_amount_minor');
    expect(migration).toContain('v_intent.expected_currency');
    expect(migration).toContain('v_intent.charge_terms_version');
    expect(migration).not.toMatch(/display_price_minor/i);
    expect(migration).not.toMatch(/from public\.product_offers/i);
  });

  it('accepts only active initial evidence and writes Receipt + receipt-scoped Provider Event atomically', () => {
    expect(migration).toContain("p_current_state is distinct from 'active'");
    expect(migration).toMatch(/insert into public\.commerce_receipts\(/i);
    expect(migration).toMatch(/insert into public\.commerce_provider_events\(/i);
    expect(migration).toContain("'verified'");
    expect(migration).toContain("'receipt'");
    expect(migration).toContain("'verified_payment'");
  });

  it('uses deterministic event fallback and stores only canonical normalized evidence fields', () => {
    expect(migration).toContain(
      "'myeongha:verified-payment:v1:' || p_evidence_fingerprint",
    );
    expect(migration).toContain("'schemaVersion', 'commerce-evidence-v2'");
    expect(migration).toContain("'evidenceFingerprint', p_evidence_fingerprint");
    expect(migration).not.toMatch(/p_raw[_a-z]*payload/i);
    expect(migration).not.toMatch(/provider_payload_jsonb|provider_secret|provider_credential/i);
  });

  it('implements exact replay and fail-closed conflicting replay without entitlement mutation', () => {
    expect(migration).toContain('v_receipt.verified_payload_jsonb is distinct from v_payload');
    expect(migration).toContain('v_event.verified_payload_jsonb is distinct from v_payload');
    expect(migration).toContain(
      "constraint = 'cmd_persist_verified_payment_evidence_v1_idempotency_conflict'",
    );
    expect(migration).toContain('return query select v_receipt.id, v_event.id, true;');
    expect(migration).not.toMatch(/insert into public\.entitlement_/i);
    expect(migration).not.toMatch(/update public\.entitlement/i);
  });

  it('runtime validates VerifiedCommerceEvidenceV2 before invoking the DB authority', () => {
    expect(runtime).toContain('requireVerifiedCommerceEvidenceV2');
    expect(runtime).toContain("evidence.currentState !== 'active'");
    expect(runtime).toContain("evidence.ownerBinding.kind !== 'purchase_intent'");
    expect(runtime).toContain('COMMERCE_VERIFIED_PAYMENT_EVIDENCE_PERSIST_COMMAND_V1');
    expect(runtime).not.toContain('resolvedSubjectId');
  });
});
