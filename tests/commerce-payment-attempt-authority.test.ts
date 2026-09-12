import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '1020_commerce_payment_attempt_authority.sql'),
  'utf8',
);

const tableDefinition = migration.match(
  /create table public\.commerce_payment_attempts \(([\s\S]*?)\n\);/,
)?.[1] ?? '';

describe('commerce payment-attempt authority migration', () => {
  it('keeps payment attempts operational and outside monetary authority', () => {
    expect(tableDefinition).not.toMatch(/\bamount_minor\b/);
    expect(tableDefinition).not.toMatch(/\bcurrency\b/);
    expect(tableDefinition).not.toMatch(/\bcharge_terms_version\b/);
    expect(tableDefinition).toContain("status in ('created', 'handed_off', 'response_received', 'failed', 'cancelled')");
    expect(tableDefinition).not.toMatch(/\bverified\b/);
    expect(tableDefinition).not.toMatch(/\bsucceeded\b/);
  });

  it('pins attempt identity, ordinal, idempotency, and provider identities', () => {
    expect(tableDefinition).toContain('unique (purchase_intent_id, attempt_no)');
    expect(tableDefinition).toContain('unique (purchase_intent_id, idempotency_key)');
    expect(tableDefinition).toContain('unique (provider, environment, provider_request_id)');
    expect(migration).toMatch(
      /create unique index commerce_payment_attempts_provider_transaction_unique[\s\S]*where provider_transaction_id is not null;/,
    );
    expect(migration).toContain('tr_commerce_payment_attempt_identity_immutable');
    expect(migration).toContain('tr_commerce_payment_attempt_provider_transaction_immutable');
    expect(migration).toContain('tr_commerce_payment_attempt_terminal_immutable');
  });

  it('derives provider authority from the immutable Purchase Intent offer', () => {
    expect(migration).toMatch(
      /select pi\.product_offer_id,[\s\S]*pi\.expected_amount_minor,[\s\S]*pi\.expected_currency,[\s\S]*pi\.charge_terms_version[\s\S]*from public\.purchase_intents pi/,
    );
    expect(migration).toMatch(
      /select po\.provider into v_provider[\s\S]*from public\.product_offers po[\s\S]*where po\.id = v_intent_offer_id/,
    );
    expect(migration).toContain('payment attempt requires Purchase Intent v2 pinned charge terms');
  });

  it('serializes attempt allocation and rechecks idempotency after the parent lock', () => {
    expect(migration).toMatch(
      /from public\.purchase_intents pi[\s\S]*where pi\.id = p_purchase_intent_id[\s\S]*for update;/,
    );

    const replayLookups = migration.match(
      /where cpa\.purchase_intent_id = p_purchase_intent_id\n\s+and cpa\.idempotency_key = p_idempotency_key;/g,
    );
    expect(replayLookups?.length).toBe(2);
    expect(migration).toMatch(
      /for update;[\s\S]*A concurrent caller may have committed[\s\S]*where cpa\.purchase_intent_id = p_purchase_intent_id[\s\S]*coalesce\(max\(cpa\.attempt_no\), 0\) \+ 1/,
    );
  });

  it('requires exact subject context for both server-runtime commands', () => {
    const contextAssertions = migration.match(
      /perform public\.assert_myeongha_subject_context_v1\(p_subject_id\);/g,
    );
    expect(contextAssertions?.length).toBe(2);
    expect(migration).toMatch(
      /create or replace function public\.cmd_create_payment_attempt_v1[\s\S]*security definer[\s\S]*set search_path = pg_catalog, public/,
    );
    expect(migration).toMatch(
      /create or replace function public\.cmd_transition_payment_attempt_v1[\s\S]*security definer[\s\S]*set search_path = pg_catalog, public/,
    );
  });

  it('keeps direct table access closed and exposes only commands to the API executor', () => {
    expect(migration).toContain('revoke all on table public.commerce_payment_attempts from public;');
    expect(migration).toContain("'anon', 'authenticated', 'service_role', 'myeongha_api_executor'");
    expect(migration).toMatch(
      /grant execute on function public\.cmd_create_payment_attempt_v1\([\s\S]*\) to myeongha_api_executor;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.cmd_transition_payment_attempt_v1\([\s\S]*\) to myeongha_api_executor;/,
    );
  });
});
