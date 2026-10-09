import {
  assessProductReaderEligibilityV1,
  type ProductReaderEligibilityAuthorityPortV1,
} from './product-reader-eligibility-policy-v1.js';
import {
  consumeOfficialReadingReaderAdmissionV1,
  type OfficialReadingReaderAdmissionScopeV1,
  type PreparedOfficialReadingReaderAdmissionV1,
} from './official-reading-reader-admission-v1.js';
import type {
  CharacterSajuOfficialStandardEligibilityV2,
} from '../../../packages/domain/src/character-saju-eligibility-v2.js';

type ProofRecord = {
  readonly scope: OfficialReadingReaderAdmissionScopeV1;
  used: boolean;
};
const officialStandardProofs = new WeakMap<object, ProofRecord>();

export class CharacterSajuOfficialEligibilityErrorV2 extends Error {
  constructor() {
    super('Official standard Character Saju eligibility is unavailable.');
    this.name = 'CharacterSajuOfficialEligibilityErrorV2';
  }
}

function deny(): never {
  throw new CharacterSajuOfficialEligibilityErrorV2();
}

function sameScope(
  prepared: OfficialReadingReaderAdmissionScopeV1,
  current: OfficialReadingReaderAdmissionScopeV1,
): boolean {
  const keys = Object.keys(prepared) as (keyof OfficialReadingReaderAdmissionScopeV1)[];
  return keys.length === Object.keys(current).length &&
    keys.every((key) => prepared[key] === current[key]);
}

/**
 * A3-alpha server issuer. A2 has already resolved the exact Subject x Thread x
 * Reader x Reading, Product eligibility, source hash, and pinned release.
 *
 * A fresh A1 lookup is deliberately required to distinguish a standard rule
 * from a future premium rule: A2-v1 tickets do NOT carry the rule kind.
 * Do not guess this from the Product name or the policy revision.
 *
 * The upstream caller must supply CURRENT server-verified scope, not merely
 * echo the original one when Grant or Thread state may have changed.
 * This function does not wire a public route or skip the legacy Domain gate.
 */
export async function issueCharacterSajuOfficialStandardEligibilityV2(input: {
  readonly prepared: PreparedOfficialReadingReaderAdmissionV1;
  readonly currentScope: OfficialReadingReaderAdmissionScopeV1;
  readonly productAuthorityPort: ProductReaderEligibilityAuthorityPortV1;
}): Promise<CharacterSajuOfficialStandardEligibilityV2> {
  const { prepared, currentScope } = input;
  if (!sameScope(prepared.scope, currentScope) ||
      prepared.source.subjectId !== currentScope.subjectId ||
      prepared.source.readingId !== currentScope.readingId ||
      prepared.source.readerCharacterId !== currentScope.readerCharacterId ||
      prepared.source.readerContentBundleId !== currentScope.readerContentBundleId ||
      prepared.source.productId !== currentScope.productId ||
      prepared.source.productSpecVersion !== currentScope.productSpecVersion ||
      prepared.source.sajuDomain !== currentScope.sajuDomain ||
      prepared.source.readingContractVersion !== currentScope.readingContractVersion ||
      prepared.source.responseHash !== currentScope.officialArtifactResponseHash) {
    return deny();
  }

  const lookupInput = Object.freeze({
    productId: currentScope.productId,
    productSpecVersion: currentScope.productSpecVersion,
    sajuDomain: currentScope.sajuDomain,
    effectiveAt: currentScope.effectiveAt,
  });
  let lookup;
  try {
    lookup = await input.productAuthorityPort.readApprovedRule(lookupInput);
  } catch {
    return deny();
  }

  const assessed = assessProductReaderEligibilityV1({
    source: Object.freeze({
      productId: currentScope.productId,
      productSpecVersion: currentScope.productSpecVersion,
      sajuDomain: currentScope.sajuDomain,
    }),
    serverReaderId: currentScope.readerCharacterId,
    lookup,
  });
  if (assessed.status !== 'eligible' ||
      assessed.ruleVersion !== currentScope.productRuleVersion ||
      assessed.approvedPolicyRevision !== currentScope.approvedPolicyRevision ||
      lookup?.status !== 'approved' ||
      lookup.rule.kind !== 'standard_all_readers') {
    return deny();
  }

  // The A2 opaque ticket is the only issuance authority. A structural clone
  // or an already-consumed ticket can never mint this official V2 proof.
  try {
    consumeOfficialReadingReaderAdmissionV1({
      ticket: prepared.ticket,
      expectedScope: currentScope,
    });
  } catch {
    return deny();
  }

  const proof = Object.freeze({
    source: 'official_standard_product_rule' as const,
    admittedDomain: currentScope.sajuDomain,
    productId: currentScope.productId,
    policyRevision: currentScope.approvedPolicyRevision,
    readingRef: currentScope.readingId,
    subjectId: currentScope.subjectId,
    readerCharacterId: currentScope.readerCharacterId,
    threadId: currentScope.threadId,
    readerContentBundleId: currentScope.readerContentBundleId,
    contentReleaseId: currentScope.contentReleaseId,
    officialArtifactResponseHash: currentScope.officialArtifactResponseHash,
  }) satisfies CharacterSajuOfficialStandardEligibilityV2;
  officialStandardProofs.set(proof, {
    scope: Object.freeze({ ...currentScope }),
    used: false,
  });
  return proof;
}

/**
 * One-use API/domain bridge for A3-beta. This MUST be called by the server
 * before accepting the tagged official variant into a V2 runtime context.
 * Any lookalike, changed scope, or replay fails closed.
 */
export function consumeCharacterSajuOfficialStandardEligibilityV2(input: {
  readonly proof: CharacterSajuOfficialStandardEligibilityV2;
  readonly currentScope: OfficialReadingReaderAdmissionScopeV1;
}): void {
  if (typeof input.proof !== 'object' || input.proof === null ||
      typeof input.currentScope !== 'object' || input.currentScope === null) {
    return deny();
  }
  const record = officialStandardProofs.get(input.proof);
  if (!record || record.used) return deny();
  record.used = true;
  if (!sameScope(record.scope, input.currentScope)) return deny();
}
