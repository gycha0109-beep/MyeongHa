import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '1040_commerce_provider_payment_verification_context.sql',
  ),
  'utf8',
);
const execution = readFileSync(
  join(process.cwd(), 'apps', 'api', 'src', 'postgres-commerce-internal-execution.ts'),
  'utf8',
);

describe('commerce provider payment verification context authority', () => {
  it('uses a dedicated non-login internal role instead of subject impersonation', () => {
    expect(migration).toMatch(
      /CREATE ROLE myeongha_commerce_internal_executor[\s\S]*NOLOGIN[\s\S]*NOINHERIT[\s\S]*NOBYPASSRLS/,
    );
    expect(migration).toContain(
      'GRANT myeongha_commerce_internal_executor TO myeongha_runtime;',
    );
    expect(execution).toContain(
      'SET LOCAL ROLE myeongha_commerce_internal_executor',
    );
    expect(execution).not.toContain('myeongha.subject_id');
    expect(execution).not.toContain('resolvedSubject');
    expect(migration).not.toContain('assert_myeongha_subject_context_v1');
    expect(migration).not.toContain("set_config('myeongha.subject_id'");
  });

  it('exposes only the narrow resolver to the internal Commerce role', () => {
    expect(migration).toMatch(
      /create or replace function public\.qry_commerce_provider_payment_verification_context_v1[\s\S]*security definer[\s\S]*set search_path = pg_catalog, public/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.qry_commerce_provider_payment_verification_context_v1\(text, text, text, text\)[\s\S]*from public, anon, authenticated, service_role, myeongha_api_executor;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.qry_commerce_provider_payment_verification_context_v1\(text, text, text, text\)[\s\S]*to myeongha_commerce_internal_executor;/,
    );
  });

  it('resolves only immutable provider attempt identity and eligible handoff states', () => {
    expect(migration).toContain('cpa.provider = v_lookup_provider');
    expect(migration).toContain('cpa.environment = v_lookup_environment');
    expect(migration).toContain('cpa.provider_request_id = v_lookup_provider_request_id');
    expect(migration).toContain(
      'cpa.provider_transaction_id = v_lookup_provider_transaction_id',
    );
    expect(migration).toContain(
      "if v_attempt_status not in ('handed_off', 'response_received') then",
    );
    expect(migration).not.toMatch(/\bpaid\b/i);
    expect(migration).not.toMatch(/\bsucceeded\b/i);
  });

  it('derives product and money authority only from Payment Attempt plus Purchase Intent v2', () => {
    expect(migration).toContain('pi.offer_snapshot_jsonb');
    expect(migration).toContain('pi.expected_amount_minor');
    expect(migration).toContain('pi.expected_currency');
    expect(migration).toContain('pi.charge_terms_version');
    expect(migration).toContain("v_offer_snapshot ->> 'externalProductId'");
    expect(migration).toContain('v_expected_amount_minor > 9007199254740991');
    expect(migration).not.toMatch(/from public\.product_offers/i);
    expect(migration).not.toMatch(/display_price_minor/i);
  });

  it('does not materialize payment success or entitlement side effects', () => {
    expect(migration).not.toMatch(/insert into public\.commerce_receipts/i);
    expect(migration).not.toMatch(/insert into public\.commerce_provider_events/i);
    expect(migration).not.toMatch(/insert into public\.entitlement_/i);
    expect(migration).not.toMatch(/update public\.entitlements/i);
  });
});
