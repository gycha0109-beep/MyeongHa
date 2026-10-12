import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import {
  assertServerPreparedStandardChatGroundingV2,
  type CharacterStandardChatGroundingV2,
} from './character-standard-reading-chat-grounding-v2.js';
import {
  closeCharacterStandardReaderSourceFocusV1,
} from './character-standard-reading-chat-source-closure-v1.js';

export const OFFICIAL_READER_SOURCE_CANDIDATE_VERSION_V1 =
  'official-reader-saju-source-candidate-v1' as const;

const unitId = /^grounding_unit_[0-9a-f]{24}$/u;
const hash64 = /^[0-9a-f]{64}$/u;
const artifactHash = /^sha256:v1:[0-9a-f]{64}$/u;
const serverCandidates = new WeakSet<object>();

export interface OfficialReaderSajuSourceCandidateV1 {
  readonly schemaVersion: typeof OFFICIAL_READER_SOURCE_CANDIDATE_VERSION_V1;
  readonly subjectId: string;
  readonly threadId: string;
  readonly readingRef: string;
  readonly readerCharacterId: string;
  readonly contentReleaseId: string;
  readonly readerContentBundleId: string;
  readonly contentRevision: number;
  readonly productId: string;
  readonly productSpecVersion: string;
  readonly productRuleVersion: string;
  readonly approvedPolicyRevision: string;
  readonly officialArtifactResponseHash: string;
  readonly groundingHash: string;
  readonly sourceUnitRefs: readonly string[];
  readonly focusedUnitRef: string;
  readonly requiredDisclosureRefs: readonly string[];
  readonly requiredAmbiguityRefs: readonly string[];
  readonly protectedOnly: boolean;
  readonly sourceCandidateHash: string;
}

export type PrepareOfficialReaderSajuSourceCandidateDecisionV1 =
  | Readonly<{ mode: 'source_candidate'; candidate: OfficialReaderSajuSourceCandidateV1 }>
  | Readonly<{ mode: 'hold'; reason: 'focus_unavailable' | 'unit_limit_exceeded' }>;

export class OfficialReaderSajuSourceCandidateErrorV1 extends Error {
  constructor(readonly code: 'ACCESS_DENIED' | 'SOURCE_MISMATCH') {
    super('Official Reader Saju source candidate is unavailable.');
    this.name = 'OfficialReaderSajuSourceCandidateErrorV1';
  }
}

function deny(code: OfficialReaderSajuSourceCandidateErrorV1['code']): never {
  throw new OfficialReaderSajuSourceCandidateErrorV1(code);
}

/**
 * RR-03 upstream admission only: accepts the exact server-minted, Saju-owned
 * grounding from the official Standard Reading pipeline. The selected focus
 * must be a real Saju Unit, including its required companions and full-source
 * disclosures/ambiguities. No free-text/LLM supplied Unit identities.
 *
 * Does NOT attest semantic/output guard success, create a persisted DB source
 * proof, authorize a purchase, substitute a fresh T2 Grant/Product check,
 * commit a chat message, or permit revealing any paid content.
 */
export function prepareOfficialReaderSajuSourceCandidateV1(input: Readonly<{
  grounded: CharacterStandardChatGroundingV2;
  focusedUnitRef: string;
}>): PrepareOfficialReaderSajuSourceCandidateDecisionV1 {
  try {
    assertServerPreparedStandardChatGroundingV2(input.grounded);
  } catch {
    return deny('ACCESS_DENIED');
  }

  const { scope, grounding, context } = input.grounded;
  if (scope.readingId !== grounding.readingRef ||
      scope.sajuDomain !== grounding.readingDomain ||
      context.saju.groundingRef.groundingHash !== grounding.groundingHash ||
      !artifactHash.test(scope.officialArtifactResponseHash) ||
      !hash64.test(grounding.groundingHash) ||
      !unitId.test(input.focusedUnitRef)) {
    return deny('SOURCE_MISMATCH');
  }

  let closed: ReturnType<typeof closeCharacterStandardReaderSourceFocusV1>;
  try {
    closed = closeCharacterStandardReaderSourceFocusV1({
      grounded: input.grounded,
      rootUnitId: input.focusedUnitRef,
    });
  } catch {
    return deny('SOURCE_MISMATCH');
  }
  if (closed.mode === 'hold') {
    return Object.freeze({ mode: 'hold' as const, reason: closed.reason });
  }

  const refs = closed.selectedUnitIds;
  if (refs.length < 1 || refs.length > 12 ||
      refs.some(ref => !unitId.test(ref)) ||
      new Set(refs).size !== refs.length ||
      !refs.includes(input.focusedUnitRef) ||
      new Set(closed.requiredDisclosureRefs).size !== closed.requiredDisclosureRefs.length ||
      new Set(closed.requiredAmbiguityRefs).size !== closed.requiredAmbiguityRefs.length) {
    return deny('SOURCE_MISMATCH');
  }

  const identity = {
    schemaVersion: OFFICIAL_READER_SOURCE_CANDIDATE_VERSION_V1,
    subjectId: scope.subjectId,
    threadId: scope.threadId,
    readingRef: scope.readingId,
    readerCharacterId: scope.readerCharacterId,
    contentReleaseId: scope.contentReleaseId,
    readerContentBundleId: scope.readerContentBundleId,
    contentRevision: scope.contentRevision,
    productId: scope.productId,
    productSpecVersion: scope.productSpecVersion,
    productRuleVersion: scope.productRuleVersion,
    approvedPolicyRevision: scope.approvedPolicyRevision,
    officialArtifactResponseHash: scope.officialArtifactResponseHash,
    groundingHash: grounding.groundingHash,
    sourceUnitRefs: Object.freeze([...refs]),
    focusedUnitRef: input.focusedUnitRef,
    requiredDisclosureRefs: Object.freeze([...closed.requiredDisclosureRefs]),
    requiredAmbiguityRefs: Object.freeze([...closed.requiredAmbiguityRefs]),
    protectedOnly: closed.protectedOnly,
  };
  const sourceCandidateHash = 'sha256:v1:' +
    createHash('sha256').update(canonicalJson(identity)).digest('hex');
  const candidate: OfficialReaderSajuSourceCandidateV1 =
    Object.freeze({ ...identity, sourceCandidateHash });
  serverCandidates.add(candidate);
  return Object.freeze({ mode: 'source_candidate' as const, candidate });
}

/**
 * A structurally matching copy from a model/client/old transcript is NEVER
 * an authoritative source candidate. This is an in-process identity check
 * only; persistence still requires source-owner attestation and fresh T2.
 */
export function assertServerOfficialReaderSajuSourceCandidateV1(
  value: unknown,
): asserts value is OfficialReaderSajuSourceCandidateV1 {
  if (typeof value !== 'object' || value === null || !serverCandidates.has(value)) {
    deny('ACCESS_DENIED');
  }
}
