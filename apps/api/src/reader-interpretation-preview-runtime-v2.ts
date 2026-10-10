import { createHash } from 'node:crypto';
import {
  SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
  SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
  admitCharacterRuntimeSajuGroundingV2,
  admitCharacterSajuGroundingBundleViewV1,
  assembleCharacterRuntimeContext,
  canonicalJson,
  guardCharacterSajuSemanticPreservationV2,
  renderCharacterSajuBoundedExactCoreV2,
  resolveCharacterSajuCommonPerspectiveV1,
  type CharacterSajuGroundingRefV1,
} from '../../../packages/domain/src/index.js';
import {
  getChatThreadRuntimeBinding,
} from './chat-thread-runtime-binding-read.js';
import {
  prepareOfficialReadingReaderAdmissionV1,
  type OfficialReadingReaderAdmissionScopeV1,
} from './official-reading-reader-admission-v1.js';
import {
  issueCharacterSajuOfficialStandardEligibilityV2,
} from './character-saju-official-eligibility-v2.js';
import {
  prepareCharacterStandardReadingServerBaseContextV2,
  assertNoCallerContentAuthorityFields,
} from './character-standard-reading-server-runtime-authority.js';
import {
  assembleOfficialStandardReaderRuntimeV2,
} from './character-saju-runtime-v2-bridge.js';
import {
  ReaderInterpretationPreviewRuntimeErrorV1,
  READER_INTERPRETATION_PREVIEW_SCHEMA_VERSION_V1,
  READER_INTERPRETATION_PREVIEW_CONTRACT_VERSION_V1,
  type ReaderInterpretationPreviewEnvelopeV1,
  type RunThreadBoundReaderInterpretationPreviewInputV1,
} from './reader-interpretation-preview-runtime-v1.js';

/** Only a V2 server-rendered, semantic-guard-passed Scene may nominate Chat source Units. */
const mintedGuardedReaderSceneV2 = new WeakSet<object>();

export function assertServerGuardedReaderInterpretationSceneV2(
  value: unknown,
): asserts value is Extract<ReaderInterpretationPreviewEnvelopeV1, { mode: 'reader_interpretation' }> {
  if (value === null || typeof value !== 'object' ||
      !mintedGuardedReaderSceneV2.has(value)) {
    throw new ReaderInterpretationPreviewRuntimeErrorV1(
      'ACCESS_DENIED',
      'Server guarded Reader Scene is required for source handoff.',
    );
  }
}

function deny(code: ReaderInterpretationPreviewRuntimeErrorV1['code']): never {
  throw new ReaderInterpretationPreviewRuntimeErrorV1(
    code, 'Official standard Reader V2 admission or source verification failed.',
  );
}

function sameScope(a: OfficialReadingReaderAdmissionScopeV1, b: OfficialReadingReaderAdmissionScopeV1): boolean {
  const keys = Object.keys(a) as (keyof OfficialReadingReaderAdmissionScopeV1)[];
  return keys.length === Object.keys(b).length && keys.every(k => a[k] === b[k]);
}

function requiredId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 512) deny('INVALID_INPUT');
  return value.trim();
}

function hashEnvelope(value: unknown): string {
  return `sha256:v1:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

/**
 * A3-gamma server-only official-standard Preview runtime.
 *
 * This function is intentionally NOT wired to the public/HTTP Reader route.
 * The server retrieves the pinned content and owned context, checks an A2
 * admission TWICE (before and after Context resolution), then consumes a
 * one-use A3 proof. No invented specialist Character Capability is admitted.
 * A2 premium/withheld rules cannot issue the standard V2 proof.
 */
export async function runThreadBoundReaderInterpretationPreviewV2(
  input: RunThreadBoundReaderInterpretationPreviewInputV1,
): Promise<ReaderInterpretationPreviewEnvelopeV1> {
  // Caller-provided Character, Memory, Saju and Release authority are rejected
  // before consulting access, Product policy or the raw Official artifact.
  assertNoCallerContentAuthorityFields(input.contextInput);
  const subjectId = requiredId(input.resolvedSubjectId);
  const readingId = requiredId(input.officialReadingId);
  if (!input.productReaderEligibilityAuthorityPort) deny('ACCESS_DENIED');
  const effectiveAt = requiredId(input.effectiveAt);
  if (!Number.isFinite(Date.parse(effectiveAt))) deny('INVALID_INPUT');

  const firstThread = await getChatThreadRuntimeBinding({
    resolvedSubjectId: subjectId, threadId: input.threadId,
    authorityPort: input.threadBindingAuthorityPort,
  });
  if (firstThread.participantCharacterIds.length !== 1 ||
      !firstThread.participantCharacterIds[0]) deny('ACCESS_DENIED');
  const reader = firstThread.participantCharacterIds[0];
  const contentEntry = input.contentReleaseRuntime.resolvePinned(firstThread.activeContentReleaseId);
  if (contentEntry.release.releaseId !== firstThread.activeContentReleaseId ||
      contentEntry.release.bundleId !== firstThread.activeContentBundleId) deny('SOURCE_MISMATCH');
  input.admitServerReader?.(reader);

  const admissionInput = {
    resolvedSubjectId: subjectId, threadId: input.threadId, readingId, effectiveAt,
    contentEntry,
    threadBindingAuthorityPort: input.threadBindingAuthorityPort,
    accessAuthorityPort: input.accessAuthorityPort,
    artifactAuthorityPort: input.artifactAuthorityPort,
    productReaderEligibilityAuthorityPort: input.productReaderEligibilityAuthorityPort,
  };
  let first;
  try { first = await prepareOfficialReadingReaderAdmissionV1(admissionInput); }
  catch { deny('ACCESS_DENIED'); }

  const base = await prepareCharacterStandardReadingServerBaseContextV2({
    resolvedSubjectId: subjectId,
    threadId: input.threadId, contentEntry,
    expectedReaderCharacterId: reader,
    threadBindingAuthorityPort: input.threadBindingAuthorityPort,
    relationshipAuthorityPort: input.relationshipAuthorityPort,
    memoryItemsAuthorityPort: input.memoryItemsAuthorityPort,
    memoryGrantsAuthorityPort: input.memoryGrantsAuthorityPort,
    nonMemoryContextAuthorityPort: input.nonMemoryContextAuthorityPort,
    contextInput: input.contextInput,
  });

  let current;
  try { current = await prepareOfficialReadingReaderAdmissionV1(admissionInput); }
  catch { deny('ACCESS_DENIED'); }
  if (!sameScope(first.scope, current.scope) ||
      current.scope.subjectId !== subjectId ||
      current.scope.readerCharacterId !== reader ||
      current.scope.readingId !== readingId ||
      base.threadBinding.threadId !== current.scope.threadId ||
      base.threadBinding.contentRevision !== current.scope.contentRevision ||
      base.threadBinding.activeContentReleaseId !== current.scope.contentReleaseId ||
      base.threadBinding.activeContentBundleId !== current.scope.readerContentBundleId ||
      base.threadBinding.participantCharacterIds.length !== 1 ||
      base.threadBinding.participantCharacterIds[0] !== reader ||
      base.contextInput.character.characterId !== reader ||
      base.contextInput.contentBundleId !== current.scope.readerContentBundleId ||
      current.source.responseHash !== first.source.responseHash) deny('SOURCE_MISMATCH');

  let context;
  try {
    const proof = await issueCharacterSajuOfficialStandardEligibilityV2({
      prepared: first, currentScope: current.scope,
      productAuthorityPort: input.productReaderEligibilityAuthorityPort,
    });
    const noSajuContext = assembleCharacterRuntimeContext(base.contextInput);
    context = assembleOfficialStandardReaderRuntimeV2({
      proof, currentScope: current.scope,
      source: current.source, baseContext: noSajuContext,
    });
  } catch {
    deny('ACCESS_DENIED');
  }

  let grounding;
  let grounded;
  try {
    const candidate = await input.groundingProjectionPort.projectGrounding(Object.freeze({
      readingId: current.source.readingId,
      readingContractVersion: current.source.readingContractVersion,
      productResponseState: current.source.productResponseState,
      responseSnapshotJsonb: current.source.responseSnapshotJsonb,
      officialArtifactResponseHash: current.source.responseHash,
      sajuEngineVersion: current.source.sajuEngineVersion,
      sajuDomain: current.source.sajuDomain,
    }));
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      deny('SOURCE_MISMATCH');
    }
    const record = candidate as Record<string, unknown>;
    if (typeof record.sourceResponseHash !== 'string' ||
        !/^[0-9a-f]{64}$/u.test(record.sourceResponseHash) ||
        typeof record.groundingHash !== 'string' ||
        !/^[0-9a-f]{64}$/u.test(record.groundingHash)) deny('SOURCE_MISMATCH');
    const expectedRef: CharacterSajuGroundingRefV1 = Object.freeze({
      schemaVersion: SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
      groundingProjectionVersion: SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
      axisRegistryVersion: SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
      readingRef: current.source.readingId,
      productResponseVersion: current.source.readingContractVersion,
      engineVersion: current.source.sajuEngineVersion,
      readingDomain: current.source.sajuDomain,
      sourceResponseHash: record.sourceResponseHash,
      groundingHash: record.groundingHash,
    });
    grounding = admitCharacterSajuGroundingBundleViewV1({ candidate, expectedRef });
    grounded = admitCharacterRuntimeSajuGroundingV2({ context, groundingRef: expectedRef });
  } catch { deny('SOURCE_MISMATCH'); }

  const perspective = resolveCharacterSajuCommonPerspectiveV1({
    characterId: grounded.characterId,
    contentVersion: grounded.contentVersion,
    sajuProfile: grounded.sajuProfile,
  });
  if (grounded.saju.eligibility.readerCharacterId !== reader ||
      grounded.saju.eligibility.subjectId !== subjectId ||
      grounded.saju.eligibility.contentReleaseId !== current.scope.contentReleaseId ||
      grounded.saju.eligibility.officialArtifactResponseHash !== current.source.responseHash ||
      grounding.readingRef !== readingId ||
      grounding.readingDomain !== current.scope.sajuDomain ||
      grounding.engineVersion !== current.source.sajuEngineVersion ||
      grounding.productResponseVersion !== current.source.readingContractVersion) deny('SOURCE_MISMATCH');

  const common = {
    schemaVersion: READER_INTERPRETATION_PREVIEW_SCHEMA_VERSION_V1,
    contractVersion: READER_INTERPRETATION_PREVIEW_CONTRACT_VERSION_V1,
    lifecycle: 'preview' as const,
    officialReadingId: readingId,
    readerCharacterId: reader,
    readerContentBundleId: current.scope.readerContentBundleId,
    requestedDomain: current.scope.sajuDomain,
    officialArtifactResponseHash: current.source.responseHash,
    sourceResponseHash: grounding.sourceResponseHash,
    groundingHash: grounding.groundingHash,
  };
  // Rendering is a fallible content/policy boundary. Never surface a raw
  // exception or an unvalidated partial utterance as a Reader interpretation.
  let rendered: ReturnType<typeof renderCharacterSajuBoundedExactCoreV2>;
  try {
    rendered = renderCharacterSajuBoundedExactCoreV2({
      context: grounded, grounding, perspective, requestedDomain: current.scope.sajuDomain,
    });
  } catch {
    const envelope = { ...common, mode: 'protected_fallback' as const,
      fallbackReason: 'renderer_protected_fallback' as const };
    return Object.freeze({ ...envelope, interpretationHash: hashEnvelope(envelope) });
  }
  if (rendered.mode === 'protected_fallback') {
    const envelope = { ...common, mode: 'protected_fallback' as const,
      fallbackReason: 'renderer_protected_fallback' as const };
    return Object.freeze({ ...envelope, interpretationHash: hashEnvelope(envelope) });
  }
  let guarded: ReturnType<typeof guardCharacterSajuSemanticPreservationV2>;
  try {
    guarded = guardCharacterSajuSemanticPreservationV2({
      candidate: rendered.utterance,
      context: grounded, grounding, perspective, requestedDomain: current.scope.sajuDomain,
    });
  } catch {
    const envelope = { ...common, mode: 'protected_fallback' as const,
      fallbackReason: 'semantic_guard_failed' as const };
    return Object.freeze({ ...envelope, interpretationHash: hashEnvelope(envelope) });
  }
  if (guarded.mode !== 'accepted') {
    const envelope = { ...common, mode: 'protected_fallback' as const,
      fallbackReason: 'semantic_guard_failed' as const };
    return Object.freeze({ ...envelope, interpretationHash: hashEnvelope(envelope) });
  }
  const envelope = { ...common, mode: 'reader_interpretation' as const,
    utterance: guarded.utterance };
  const scene = Object.freeze({ ...envelope, interpretationHash: hashEnvelope(envelope) });
  mintedGuardedReaderSceneV2.add(scene);
  return scene;
}
