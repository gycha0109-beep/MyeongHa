import {
  SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
  SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
  admitCharacterRuntimeSajuGroundingV2,
  admitCharacterSajuGroundingBundleViewV1,
  canonicalJson,
  type CharacterRuntimeContextWithGroundingV2,
  type CharacterSajuGroundingBundleViewV1,
  type CharacterSajuGroundingRefV1,
} from '../../../packages/domain/src/index.js';
import {
  getServerPreparedChatReceiveContentEntryV1,
} from './chat-receive.js';
import {
  assertServerPreparedStandardChatPreflightV2,
  type CharacterStandardReadingChatTurnPreflightV2,
} from './character-standard-reading-chat-turn-preflight-v2.js';
import {
  prepareOfficialReadingReaderAdmissionV1,
  type OfficialReadingReaderAdmissionScopeV1,
  type PreparedOfficialReadingReaderAdmissionV1,
} from './official-reading-reader-admission-v1.js';
import {
  issueCharacterSajuOfficialStandardEligibilityV2,
  consumeCharacterSajuOfficialStandardEligibilityV2,
} from './character-saju-official-eligibility-v2.js';
import type {
  CharacterStandardReadingAccessAuthorityPortV1,
  CharacterStandardReadingArtifactAuthorityPortV1,
} from './character-standard-reading-knowledge.js';
import type {
  ChatThreadRuntimeBindingReadAuthorityPortV1,
} from './chat-thread-runtime-binding-read.js';
import type {
  ProductReaderEligibilityAuthorityPortV1,
} from './product-reader-eligibility-policy-v1.js';
import type {
  OfficialReadingCharacterGroundingProjectionPortV1,
} from './reader-interpretation-preview-runtime-v1.js';

export interface PrepareCharacterStandardChatGroundingInputV2 {
  readonly preflight: CharacterStandardReadingChatTurnPreflightV2;
  readonly threadBindingAuthorityPort: ChatThreadRuntimeBindingReadAuthorityPortV1;
  readonly accessAuthorityPort: CharacterStandardReadingAccessAuthorityPortV1;
  readonly artifactAuthorityPort: CharacterStandardReadingArtifactAuthorityPortV1;
  readonly productReaderEligibilityAuthorityPort: ProductReaderEligibilityAuthorityPortV1;
  readonly groundingProjectionPort: OfficialReadingCharacterGroundingProjectionPortV1;
}

export interface CharacterStandardChatGroundingV2 {
  readonly scope: OfficialReadingReaderAdmissionScopeV1;
  readonly context: CharacterRuntimeContextWithGroundingV2;
  readonly grounding: CharacterSajuGroundingBundleViewV1;
}

const mintedStandardChatGroundingsV2 = new WeakSet<object>();

/** Downstream question-focus and rendering consumers require this exact server artifact. */
export function assertServerPreparedStandardChatGroundingV2(
  candidate: unknown,
): asserts candidate is CharacterStandardChatGroundingV2 {
  if (typeof candidate !== 'object' || candidate === null ||
      !mintedStandardChatGroundingsV2.has(candidate)) {
    throw new CharacterStandardChatGroundingErrorV2('ACCESS_DENIED');
  }
}

export class CharacterStandardChatGroundingErrorV2 extends Error {
  constructor(readonly code: 'ACCESS_DENIED' | 'SOURCE_MISMATCH' | 'GROUNDING_UNAVAILABLE') {
    super('Official standard Chat grounding is unavailable.');
    this.name = 'CharacterStandardChatGroundingErrorV2';
  }
}

function deny(code: CharacterStandardChatGroundingErrorV2['code']): never {
  throw new CharacterStandardChatGroundingErrorV2(code);
}

function sameScope(
  a: OfficialReadingReaderAdmissionScopeV1,
  b: OfficialReadingReaderAdmissionScopeV1,
): boolean {
  const keys = Object.keys(a) as (keyof OfficialReadingReaderAdmissionScopeV1)[];
  return keys.length === Object.keys(b).length &&
    keys.every((key) => a[key] === b[key]);
}

function assertFresh(
  preflight: CharacterStandardReadingChatTurnPreflightV2,
  prepared: PreparedOfficialReadingReaderAdmissionV1,
): void {
  const original = preflight.scope;
  const current = prepared.scope;
  const eligibility = preflight.runtime.saju.eligibility;
  if (!sameScope(original, current) ||
      current.subjectId !== eligibility.subjectId ||
      current.readerCharacterId !== eligibility.readerCharacterId ||
      current.readingId !== eligibility.readingRef ||
      current.contentReleaseId !== eligibility.contentReleaseId ||
      current.readerContentBundleId !== eligibility.readerContentBundleId ||
      current.sajuDomain !== eligibility.admittedDomain ||
      current.officialArtifactResponseHash !== eligibility.officialArtifactResponseHash ||
      current.approvedPolicyRevision !== eligibility.policyRevision ||
      current.productId !== eligibility.productId ||
      current.threadId !== eligibility.threadId ||
      preflight.runtime.schemaVersion !== 'v2' ||
      preflight.runtime.saju.readingRef !== current.readingId ||
      preflight.runtime.saju.domain !== current.sajuDomain ||
      preflight.runtime.characterId !== current.readerCharacterId ||
      preflight.runtime.contentBundleId !== current.readerContentBundleId ||
      preflight.threadBinding.threadId !== current.threadId ||
      preflight.threadBinding.contentRevision !== current.contentRevision ||
      preflight.threadBinding.activeContentReleaseId !== current.contentReleaseId ||
      preflight.threadBinding.activeContentBundleId !== current.readerContentBundleId ||
      preflight.threadBinding.participantCharacterIds.length !== 1 ||
      preflight.threadBinding.participantCharacterIds[0] !== current.readerCharacterId ||
      prepared.source.responseHash !== current.officialArtifactResponseHash) {
    deny('SOURCE_MISMATCH');
  }
}

/**
 * A3-zeta / 2-A: server-only Official Reading Chat grounding admission.
 *
 * A2 and fresh A3 standard Product proof are checked before calling Saju and
 * again after the fallible cross-service projection. The A3 one-use proof is
 * consumed at each boundary; a held/revoked/reclassified Product, changed
 * thread, or changed artifact cannot produce admitted Chat grounding.
 *
 * Still NOT a Chat generation/commit/reveal authority: final DB transactional
 * rechecks are explicitly required in later PRs.
 */
export async function prepareCharacterStandardChatGroundingV2(
  input: PrepareCharacterStandardChatGroundingInputV2,
): Promise<CharacterStandardChatGroundingV2> {
  // A structural clone of an admitted Chat preflight is not authority.
  assertServerPreparedStandardChatPreflightV2(input.preflight);
  const preflight = input.preflight;
  const contentEntry = getServerPreparedChatReceiveContentEntryV1(preflight.receivePlan);
  const request = preflight.receivePlan.normalizedRequest;
  if (request.threadId !== preflight.scope.threadId ||
      preflight.scope.contentReleaseId !== preflight.receivePlan.resolvedContent.releaseId ||
      preflight.scope.readerContentBundleId !== preflight.receivePlan.resolvedContent.bundleId ||
      preflight.scope.subjectId !== preflight.runtime.saju.eligibility.subjectId) {
    deny('SOURCE_MISMATCH');
  }
  const admissionInput = {
    resolvedSubjectId: preflight.scope.subjectId,
    threadId: preflight.scope.threadId,
    readingId: preflight.scope.readingId,
    effectiveAt: preflight.scope.effectiveAt,
    contentEntry,
    threadBindingAuthorityPort: input.threadBindingAuthorityPort,
    accessAuthorityPort: input.accessAuthorityPort,
    artifactAuthorityPort: input.artifactAuthorityPort,
    productReaderEligibilityAuthorityPort: input.productReaderEligibilityAuthorityPort,
  };

  let initial: PreparedOfficialReadingReaderAdmissionV1;
  try {
    initial = await prepareOfficialReadingReaderAdmissionV1(admissionInput);
    assertFresh(preflight, initial);
    const proof = await issueCharacterSajuOfficialStandardEligibilityV2({
      prepared: initial,
      currentScope: initial.scope,
      productAuthorityPort: input.productReaderEligibilityAuthorityPort,
    });
    consumeCharacterSajuOfficialStandardEligibilityV2({
      proof, currentScope: initial.scope,
    });
  } catch {
    deny('ACCESS_DENIED');
  }

  let candidate: unknown;
  try {
    candidate = await input.groundingProjectionPort.projectGrounding(Object.freeze({
      readingId: initial.source.readingId,
      readingContractVersion: initial.source.readingContractVersion,
      productResponseState: initial.source.productResponseState,
      responseSnapshotJsonb: initial.source.responseSnapshotJsonb,
      officialArtifactResponseHash: initial.source.responseHash,
      sajuEngineVersion: initial.source.sajuEngineVersion,
      sajuDomain: initial.source.sajuDomain,
    }));
  } catch {
    deny('GROUNDING_UNAVAILABLE');
  }

  // The Saju call is untrusted until its source-owned bundle and the current
  // DB/commerce authority both pass exact provenance checks.
  let grounding: CharacterSajuGroundingBundleViewV1;
  try {
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
      deny('SOURCE_MISMATCH');
    }
    const record = candidate as Record<string, unknown>;
    if (typeof record.sourceResponseHash !== 'string' ||
        !/^[0-9a-f]{64}$/u.test(record.sourceResponseHash) ||
        typeof record.groundingHash !== 'string' ||
        !/^[0-9a-f]{64}$/u.test(record.groundingHash)) {
      deny('SOURCE_MISMATCH');
    }
    const ref: CharacterSajuGroundingRefV1 = Object.freeze({
      schemaVersion: SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
      groundingProjectionVersion: SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
      axisRegistryVersion: SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
      readingRef: initial.source.readingId,
      productResponseVersion: initial.source.readingContractVersion,
      engineVersion: initial.source.sajuEngineVersion,
      readingDomain: initial.source.sajuDomain,
      sourceResponseHash: record.sourceResponseHash,
      groundingHash: record.groundingHash,
    });
    grounding = admitCharacterSajuGroundingBundleViewV1({ candidate, expectedRef: ref });

    const current = await prepareOfficialReadingReaderAdmissionV1(admissionInput);
    assertFresh(preflight, current);
    if (!sameScope(initial.scope, current.scope) ||
        canonicalJson(initial.source) !== canonicalJson(current.source)) {
      deny('SOURCE_MISMATCH');
    }
    const finalProof = await issueCharacterSajuOfficialStandardEligibilityV2({
      prepared: current,
      currentScope: current.scope,
      productAuthorityPort: input.productReaderEligibilityAuthorityPort,
    });
    consumeCharacterSajuOfficialStandardEligibilityV2({
      proof: finalProof,
      currentScope: current.scope,
    });

    const context = admitCharacterRuntimeSajuGroundingV2({
      context: preflight.runtime,
      groundingRef: ref,
    });
    const result = Object.freeze({
      scope: current.scope,
      context,
      grounding,
    });
    mintedStandardChatGroundingsV2.add(result);
    return result;
  } catch {
    deny('SOURCE_MISMATCH');
  }
}
