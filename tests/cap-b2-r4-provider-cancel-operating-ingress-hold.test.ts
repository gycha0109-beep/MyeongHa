import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Source guard, NOT evidence that the deployed webhook can process refunds.
// The current PortOne V2 route is paid-only. A future Provider cancellation
// ingress must first pass the R3 all-Writer lock/transaction owner gates.
const read = (name: string) => readFileSync(name, 'utf8');
const webhook = read('apps/api/src/portone-v2-webhook-payment-completion.ts');
const persistence = read('apps/api/src/commerce-verified-payment-evidence-persistence.ts');
const provider = read('apps/api/src/commerce-provider-payment-completion-orchestration.ts');
const verifiedPayment = read('supabase/migrations/1050_commerce_verified_payment_evidence_persistence.sql');
const privateCancel = read('supabase/migrations/1850_standard_reader_initial_verified_refund_private_v1.sql');
const privateIssuer = read('supabase/migrations/1860_standard_reader_initial_receipt_cancel_guard_private_v1.sql');

describe('CAP-B2 R4 Provider cancellation ingress remains operationally HOLD', () => {
  it('recognizes only Transaction.Paid in currently routed PortOne V2 completion', () => {
    expect(webhook).toContain("PORTONE_V2_WEBHOOK_PAID_EVENT_V1 = 'Transaction.Paid'");
    expect(webhook).toContain('if (type !== PORTONE_V2_WEBHOOK_PAID_EVENT_V1)');
    expect(webhook).toContain("kind: 'ignored'");
    expect(webhook).toContain('executeAuthenticatedCommerceProviderPaymentCompletionV1({');
  });

  it('does not treat initial active evidence persistence as a cancellation callback', () => {
    expect(persistence).toContain('public.cmd_persist_verified_payment_evidence_v1');
    expect(persistence).not.toContain('internal_execute_b2_r2_initial_verified_cancel_effect_private_v1');
    expect(provider).not.toContain('internal_execute_b2_r2_initial_verified_cancel_effect_private_v1');
    expect(verifiedPayment).toContain("p_current_state is distinct from 'active'");
    expect(verifiedPayment).toContain('initial verified-payment persistence accepts active evidence only');
  });

  it('preserves private-only staged 1850 revoke and 1860 zero-Grant issuer guard', () => {
    expect(privateCancel).toContain('internal_execute_b2_r2_initial_verified_cancel_effect_private_v1');
    expect(privateCancel).toContain('revoke all on function public.internal_execute_b2_r2_initial_verified_cancel_effect_private_v1');
    expect(privateIssuer).toContain('internal_apply_b2_r2_initial_receipt_cancel_guarded_private_v1');
    expect(privateIssuer).toContain('revoke all on function public.internal_apply_b2_r2_initial_receipt_cancel_guarded_private_v1');
    expect(privateIssuer).toContain("pe.event_type='payment.cancelled'");
    expect(privateIssuer).toContain("pe.status in ('verified','processed')");
  });
});
