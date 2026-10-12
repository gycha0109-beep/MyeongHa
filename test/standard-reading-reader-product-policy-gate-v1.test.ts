import { describe, expect, it, vi } from 'vitest';
import { SAJU_DOMAINS } from '../packages/contracts/src/index.js';
import { OFFICIAL_READER_RUNTIME_IDS_V1 } from '../apps/api/src/reader-production-rollout-policy-v1.js';
import {
  createPolicyGuardedStandardReaderSelectionPortV1,
} from '../apps/api/src/standard-reading-reader-product-policy-gate-v1.js';

const PRODUCT = 'synthetic-off-sale-product';
const SPEC = 'synthetic-standard-spec-v1';
const READER = 'seyeon';
const INPUT = Object.freeze({
  subjectId: 'synthetic-member',
  productId: PRODUCT,
  readerCharacterId: READER,
});
const SELECTION = Object.freeze({
  productId: PRODUCT, topicKey: 'synthetic-general',
  specVersion: SPEC, readerCharacterId: READER,
  readerContentBundleId: 'synthetic-bundle-pinned',
});
const SCOPE = Object.freeze({
  productId: PRODUCT,
  productSpecVersion: SPEC,
  sajuDomain: 'general' as const,
  effectiveAt: '2026-10-12T02:00:00.000Z',
});

function fixture(input: {
  selection?: unknown;
  scope?: unknown;
  rule?: unknown;
} = {}) {
  const selected = input.selection === undefined ? SELECTION : input.selection;
  const scope = input.scope === undefined ? SCOPE : input.scope;
  const rule = input.rule === undefined ? {
    status: 'approved', rule: {
      kind: 'standard_all_readers',
      productId: PRODUCT, productSpecVersion: SPEC,
      sajuDomain: SCOPE.sajuDomain,
      ruleVersion: 'synthetic-rule-v1',
      approvedPolicyRevision: 'synthetic-approval-v1',
    },
  } : input.rule;
  const select = vi.fn(async () => selected);
  const readCurrentScope = vi.fn(async () => scope);
  const readApprovedRule = vi.fn(async (_input: unknown) => rule);
  const port = createPolicyGuardedStandardReaderSelectionPortV1({
    catalogAndUnlockPort: {
      resolveEligibleReaderSelection: select as never,
    },
    productScopePort: {
      readCurrentScope: readCurrentScope as never,
    },
    approvedRulePort: {
      readApprovedRule: readApprovedRule as never,
    },
  });
  return { port, select, readCurrentScope, readApprovedRule };
}

describe('D-01 inactive Product policy guard for existing Catalog + Unlock Reader selection', () => {
  it('uses exact versioned Product rule and remains only a reader-selection candidate', async () => {
    const f = fixture();
    const result = await f.port.resolveEligibleReaderSelection(INPUT);
    expect(result).toEqual(SELECTION);
    expect(Object.isFrozen(result)).toBe(true);
    expect(f.select).toHaveBeenCalledWith(INPUT);
    expect(f.readCurrentScope).toHaveBeenCalledWith({
      productId: PRODUCT, productSpecVersion: SPEC,
    });
    expect(f.readApprovedRule).toHaveBeenCalledWith(SCOPE);
    expect(f.readApprovedRule.mock.calls[0]?.[0]).not.toHaveProperty('subjectId');
    expect(result).not.toHaveProperty('grant');
    expect(result).not.toHaveProperty('saleable');
    expect(result).not.toHaveProperty('publicActivated');
  });

  it('permits 9×9 synthetic Standard combinations only from explicit approved Product source', async () => {
    for (const sajuDomain of SAJU_DOMAINS) {
      for (const readerCharacterId of OFFICIAL_READER_RUNTIME_IDS_V1) {
        const selection = { ...SELECTION, readerCharacterId };
        const scope = { ...SCOPE, sajuDomain };
        const f = fixture({
          selection, scope,
          rule: {
            status: 'approved',
            rule: {
              kind: 'standard_all_readers',
              productId: PRODUCT, productSpecVersion: SPEC,
              sajuDomain, ruleVersion: 'synthetic-rule',
              approvedPolicyRevision: 'synthetic-approval',
            },
          },
        });
        expect(await f.port.resolveEligibleReaderSelection({
          ...INPUT, readerCharacterId,
        })).toEqual(selection);
      }
    }
  });

  it('stops before Product lookup when existing catalog/unlock resolver has no eligible Reader', async () => {
    const f = fixture({ selection: null });
    expect(await f.port.resolveEligibleReaderSelection(INPUT)).toBeNull();
    expect(f.readCurrentScope).not.toHaveBeenCalled();
    expect(f.readApprovedRule).not.toHaveBeenCalled();
  });

  it.each([
    { ...SELECTION, productId: 'other-product' },
    { ...SELECTION, readerCharacterId: 'baekheon' },
    { ...SELECTION, readerContentBundleId: '' },
    { ...SELECTION, specVersion: null },
  ])('blocks malformed or drifted catalog-selected scope', async (selection) => {
    const f = fixture({ selection });
    expect(await f.port.resolveEligibleReaderSelection(INPUT)).toBeNull();
    expect(f.readCurrentScope).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { ...SCOPE, productId: 'other-product' },
    { ...SCOPE, productSpecVersion: 'old-product-version' },
    { ...SCOPE, effectiveAt: 'not-a-db-clock' },
    { ...SCOPE, sajuDomain: 'unknown-specialist-domain' },
  ])('blocks missing, stale or malformed Product authority without reading a rule', async (scope) => {
    const f = fixture({ scope });
    expect(await f.port.resolveEligibleReaderSelection(INPUT)).toBeNull();
    if (scope === null ||
        scope.productId !== PRODUCT || scope.productSpecVersion !== SPEC) {
      expect(f.readApprovedRule).not.toHaveBeenCalled();
    }
  });

  it.each([
    { status: 'withheld', reason: 'disabled' },
    { status: 'withheld', reason: 'stale' },
    { status: 'withheld', reason: 'unclassified' },
    { status: 'approved', rule: {
      kind: 'standard_all_readers', productId: PRODUCT,
      productSpecVersion: SPEC, sajuDomain: 'wealth',
      ruleVersion: 'policy-v1', approvedPolicyRevision: 'revision',
    } },
    { status: 'approved', rule: {
      kind: 'standard_all_readers', productId: PRODUCT,
      productSpecVersion: SPEC, sajuDomain: 'general',
      ruleVersion: '', approvedPolicyRevision: 'revision',
    } },
  ])('blocks withheld, mismatched or invalid Product policy', async (rule) => {
    const f = fixture({ rule });
    expect(await f.port.resolveEligibleReaderSelection(INPUT)).toBeNull();
  });

  it('links a Premium Product only to its target Reader without globally restricting other Products', async () => {
    const rule = {
      status: 'approved', rule: {
        kind: 'premium_character_bound',
        productId: PRODUCT, productSpecVersion: SPEC,
        sajuDomain: 'general',
        ruleVersion: 'synthetic-premium-rule',
        approvedPolicyRevision: 'synthetic-approved-premium',
        targetReaderId: 'taegyeom',
      },
    };
    expect(await fixture({ rule }).port.resolveEligibleReaderSelection(INPUT)).toBeNull();
    // An owning Reader connection still does not prove specialist capability or a paid Grant.
    const allowed = fixture({
      selection: { ...SELECTION, readerCharacterId: 'taegyeom' },
      rule,
    });
    expect(await allowed.port.resolveEligibleReaderSelection({
      ...INPUT, readerCharacterId: 'taegyeom',
    })).toEqual({ ...SELECTION, readerCharacterId: 'taegyeom' });
  });

  it('fails closed if catalog, scope or approved Product rule backend is unavailable', async () => {
    for (const broken of ['catalog', 'scope', 'rule'] as const) {
      const f = fixture();
      const promise = async () => { throw new Error('PRIVATE_BACKEND_SECRET'); };
      if (broken === 'catalog') f.select.mockImplementation(promise);
      if (broken === 'scope') f.readCurrentScope.mockImplementation(promise);
      if (broken === 'rule') f.readApprovedRule.mockImplementation(promise);
      await expect(f.port.resolveEligibleReaderSelection(INPUT)).resolves.toBeNull();
    }
  });
});
