import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '1110_commerce_payment_attempt_handoff_context.sql',
  ),
  'utf8',
);

const readBoundary = readFileSync(
  join(
    process.cwd(),
    'apps',
    'api',
    'src',
    'payment-attempt-handoff-context-read.ts',
  ),
  'utf8',
);

const httpBoundary = readFileSync(
  join(
    process.cwd(),
    'apps',
    'api',
    'src',
    'payment-attempt-handoff-context-http.ts',
  ),
  'utf8',
);

const productionRuntime = readFileSync(
  join(
    process.cwd(),
    'apps',
    'api',
    'src',
    'production-payment-attempt-handoff-context-runtime.ts',
  ),
  'utf8',
);

describe('Payment Attempt handoff context authority', () => {
  it('is transaction-subject-bound and executor-only', () => {
    expect(migration).toContain(
      'perform public.assert_myeongha_subject_context_v1(p_subject_id);',
    );
    expect(migration).toContain('where cpa.id = p_payment_attempt_id');
    expect(migration).toContain('and cpa.subject_id = p_subject_id;');
    expect(migration).toMatch(
      /revoke all on function public\.qry_commerce_payment_attempt_handoff_context_v1\(uuid, uuid\)[\s\S]*from public, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.qry_commerce_payment_attempt_handoff_context_v1\(uuid, uuid\)[\s\S]*to myeongha_api_executor;/,
    );
  });

  it('admits only pre-browser created attempts with a non-terminal Purchase Intent', () => {
    expect(migration).toContain("v_attempt_status is distinct from 'created'");
    expect(migration).toContain("v_intent_status not in ('created', 'pending')");
    expect(migration).toContain(
      "constraint = 'qry_commerce_payment_attempt_handoff_context_state_ineligible'",
    );
  });

  it('takes money and currency only from pinned Purchase Intent authority', () => {
    expect(migration).toContain('pi.expected_amount_minor');
    expect(migration).toContain('pi.expected_currency');
    expect(migration).toContain('pi.charge_terms_version');
    expect(migration).toContain('v_expected_amount_minor > 9007199254740991');
    expect(migration).not.toMatch(/display_price_minor/iu);
    expect(migration).not.toMatch(/from public\.product_offers/iu);
  });

  it('uses provider_request_id as the handoff identity and excludes transaction identity', () => {
    expect(migration).toContain('cpa.provider_request_id');
    expect(migration).toContain('PortOne `paymentId`');
    const returnsBlock = migration.match(/returns table \(([\s\S]*?)\)\nlanguage plpgsql/u)?.[1] ?? '';
    expect(returnsBlock).toContain('provider_request_id text');
    expect(returnsBlock).not.toContain('provider_transaction_id');
    expect(readBoundary).toContain('provider_request_id as "providerRequestId"');
    expect(readBoundary).not.toContain('provider_transaction_id');
  });

  it('is read-only and contains no PSP/browser activation surface', () => {
    const implementation = [migration, readBoundary, httpBoundary, productionRuntime].join('\n');
    expect(migration).not.toMatch(/insert into public\./iu);
    expect(migration).not.toMatch(/update public\./iu);
    expect(migration).not.toMatch(/delete from public\./iu);
    expect(implementation).not.toContain('requestPayment');
    expect(implementation).not.toContain('storeId');
    expect(implementation).not.toContain('channelKey');
    expect(implementation).not.toMatch(/fetch\s*\(/u);
    expect(httpBoundary).toContain('publicRoute: null');
  });
});
