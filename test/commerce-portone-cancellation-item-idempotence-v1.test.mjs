import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const candidate = readFileSync(
  new URL('../docs/operations/candidates/commerce_portone_cancellation_event_persistence_v1.sql',import.meta.url),
  'utf8',
);
const partialPg17 = readFileSync(
  new URL('./db/commerce_portone_cancellation_partial_set_pg17_generator.mjs',import.meta.url),
  'utf8',
);
const scratchSql = readFileSync(
  new URL('./db/commerce_portone_cancellation_event_private_persist_v1.sql',import.meta.url),
  'utf8',
);

describe('canonical PortOne cancellation item idempotence', () => {
  it('serializes by original verified Receipt before checking the exact cancellationId HMAC', () => {
    const receiptLock = candidate.indexOf('for update of cr;');
    const sameWebhookReplay = candidate.indexOf('return query select v_event.id,true;');
    const itemCheck = candidate.indexOf('cancellation_event_persist_same_item_webhook_conflict');
    const eventInsert = candidate.indexOf('insert into public.commerce_provider_events(');
    expect(receiptLock).toBeGreaterThan(0);
    expect(sameWebhookReplay).toBeGreaterThan(receiptLock);
    expect(itemCheck).toBeGreaterThan(sameWebhookReplay);
    expect(eventInsert).toBeGreaterThan(itemCheck);
    expect(candidate).toContain('e.resolved_receipt_id=v_receipt.id');
    expect(candidate).toContain("e.verified_payload_jsonb->>'cancellationIdHmac'=p_cancellation_id_hmac");
    expect(candidate).not.toContain('on conflict do update');
  });

  it('keeps identical webhook replay separate from different webhook same cancellation item', () => {
    expect(candidate).toContain("e.external_event_id=p_provider_event_id");
    expect(candidate).toContain('return query select v_event.id,true;');
    expect(candidate).toContain('constraint=\'cancellation_event_persist_same_item_webhook_conflict\'');
    expect(partialPg17).toContain('webhook-B-duplicate');
    expect(partialPg17).toContain('PG17_DUPLICATE_CANCELLATION_ITEM_MUTATED_CANONICAL_LEDGER');
    expect(scratchSql).toContain('webhook-A-second');
    expect(scratchSql).toContain('duplicate cancellation item mutated Reader A ledger');
  });

  it('stays a private candidate without enabling refunds or Grant revoke', () => {
    expect(candidate).toContain('NON-DEPLOYABLE SQL CANDIDATE');
    expect(candidate).toContain("'orderingProven',false");
    expect(candidate).toContain("'refundExecutionAuthorized',false");
    expect(candidate).toContain("'entitlementRevocationAuthorized',false");
    expect(candidate).toContain('revoke all on function');
    expect(candidate).not.toMatch(/\b(?:insert into public\.entitlement_events|update public\.entitlement_grants|http_post)\b/iu);
  });
});
