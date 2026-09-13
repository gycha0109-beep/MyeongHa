import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '1030_commerce_payment_verification_context_query.sql',
  ),
  'utf8',
);

describe('commerce payment verification context authority migration', () => {
  it('is subject-bound and exposed only through the narrow API executor function', () => {
    expect(migration).toContain(
      'perform public.assert_myeongha_subject_context_v1(p_subject_id);',
    );
    expect(migration).toMatch(
      /create or replace function public\.qry_commerce_payment_verification_context_v1[\s\S]*security definer[\s\S]*set search_path = pg_catalog, public/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.qry_commerce_payment_verification_context_v1\(uuid, uuid\)[\s\S]*from public, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.qry_commerce_payment_verification_context_v1\(uuid, uuid\)[\s\S]*to myeongha_api_executor;/,
    );
  });

  it('composes only handoff-eligible attempts and never invents paid semantics', () => {
    expect(migration).toContain(
      "if v_attempt_status not in ('handed_off', 'response_received') then",
    );
    expect(migration).not.toMatch(/\bverified\b\s*,\s*'paid'/i);
    expect(migration).not.toMatch(/insert into public\.commerce_receipts/i);
    expect(migration).not.toMatch(/insert into public\.commerce_provider_events/i);
    expect(migration).not.toMatch(/insert into public\.entitlement_/i);
    expect(migration).not.toMatch(/update public\.entitlements/i);
  });

  it('reads product identity from the persisted Purchase Intent snapshot', () => {
    expect(migration).toContain('pi.offer_snapshot_jsonb');
    expect(migration).toContain("v_offer_snapshot ->> 'platform'");
    expect(migration).toContain("v_offer_snapshot ->> 'provider'");
    expect(migration).toContain("v_offer_snapshot ->> 'externalProductId'");
    expect(migration).toContain("v_offer_snapshot ->> 'productOfferId'");
    expect(migration).not.toMatch(/from public\.product_offers/i);
  });

  it('uses pinned Purchase Intent monetary authority and enforces JS-safe amounts', () => {
    expect(migration).toContain('pi.expected_amount_minor');
    expect(migration).toContain('pi.expected_currency');
    expect(migration).toContain('pi.charge_terms_version');
    expect(migration).toContain('v_expected_amount_minor > 9007199254740991');
    expect(migration).not.toMatch(/display_price_minor/i);
  });

  it('requires exact canonical snapshot shape and provider/offer continuity', () => {
    expect(migration).toContain("'productOfferId'");
    expect(migration).toContain("'productId'");
    expect(migration).toContain("'externalProductId'");
    expect(migration).toContain(
      'v_snapshot_offer_id is distinct from v_attempt_offer_id::text',
    );
    expect(migration).toContain('v_snapshot_provider is distinct from v_provider');
  });
});
