import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const orchestration = readFileSync(
  join(
    process.cwd(),
    'apps',
    'api',
    'src',
    'commerce-provider-payment-completion-orchestration.ts',
  ),
  'utf8',
);

describe('authenticated provider payment completion orchestration authority', () => {
  it('accepts only provider-owned lookup identity from the authenticated ingress boundary', () => {
    expect(orchestration).toMatch(
      /AUTHENTICATED_INGRESS_KEYS:\s*ReadonlySet<string>\s*=\s*new Set\(\[\s*'provider',\s*'environment',\s*'providerRequestId',\s*'providerTransactionId',\s*\]/,
    );
    expect(orchestration).not.toContain('subjectId');
    expect(orchestration).not.toContain('purchaseIntentId: input.authenticatedIngress');
    expect(orchestration).not.toContain('expectedAmountMinor: input.authenticatedIngress');
    expect(orchestration).not.toContain('expectedCurrency: input.authenticatedIngress');
  });

  it('composes context resolution, provider verification, and verified evidence persistence in order', () => {
    const mainBody = orchestration.match(
      /export async function executeAuthenticatedCommerceProviderPaymentCompletionV1[\s\S]*$/u,
    )?.[0];

    expect(mainBody).toBeDefined();
    if (mainBody === undefined) {
      throw new Error('Authenticated provider payment completion entrypoint is missing.');
    }

    const resolveIndex = mainBody.indexOf('resolveVerificationContext({');
    const verifyIndex = mainBody.indexOf('executeCommercePaymentVerificationV1({');
    const persistIndex = mainBody.indexOf('persistVerificationResult({');

    expect(resolveIndex).toBeGreaterThan(-1);
    expect(verifyIndex).toBeGreaterThan(resolveIndex);
    expect(persistIndex).toBeGreaterThan(verifyIndex);
    expect(
      orchestration.match(/executePostgresCommerceInternalTransactionV1\(/gu),
    ).toHaveLength(2);
  });

  it('keeps provider verification outside the two internal Commerce transaction callbacks', () => {
    const resolveHelper = orchestration.match(
      /async function resolveVerificationContext[\s\S]*?\n}\n\nasync function persistVerificationResult/,
    )?.[0];
    const persistHelper = orchestration.match(
      /async function persistVerificationResult[\s\S]*?\n}\n\nexport async function executeAuthenticatedCommerceProviderPaymentCompletionV1/,
    )?.[0];

    expect(resolveHelper).toContain('executePostgresCommerceInternalTransactionV1');
    expect(resolveHelper).not.toContain('executeCommercePaymentVerificationV1');
    expect(persistHelper).toContain('executePostgresCommerceInternalTransactionV1');
    expect(persistHelper).not.toContain('executeCommercePaymentVerificationV1');
  });

  it('does not add provider-specific or entitlement authority', () => {
    expect(orchestration).not.toMatch(/portone/iu);
    expect(orchestration).not.toMatch(/webhook/iu);
    expect(orchestration).not.toMatch(/entitlement/iu);
    expect(orchestration).not.toMatch(/authorization header/iu);
    expect(orchestration).not.toMatch(/raw payload/iu);
  });
});
