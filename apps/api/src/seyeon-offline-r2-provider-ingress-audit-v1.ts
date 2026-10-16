import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import type {
  SeyeonStructuredProviderPortV2,
  SeyeonStructuredProviderRequestV2,
} from './seyeon-character-runtime-v2.js';
import {
  admitSeyeonOfflineS0ContextCandidateV1,
  type SeyeonOfflineS0ContextCandidateV1,
} from './seyeon-offline-s0-context-admission-v1.js';

/**
 * G0 R2 MODEL INGRESS OBSERVATION ONLY. Not a source-closure authority.
 *
 * This checks selected *structured source fields* on already composed native
 * Provider requests. It cannot prove provenance of arbitrary natural-language
 * text, signed Bible releases, hidden Reader tools, or future provider payloads.
 * A positive answer CANNOT authorize a Production model call or Grant Reveal.
 */
export const SEYEON_OFFLINE_R2_INGRESS_AUDIT_VERSION_V1 =
  'seyeon-offline-r2-provider-ingress-audit-v1' as const;

export type SeyeonOfflineR2IngressAuditVerdictV1 =
  | Readonly<{
      state: 'observed_synthetic_only';
      requestDigest: string;
      permitsProductionProvider: false;
      permitsProductionReveal: false;
    }>
  | Readonly<{
      state: 'held';
      permitsProductionProvider: false;
    }>;

const HELD = Object.freeze({
  state: 'held' as const, permitsProductionProvider: false as const,
});
type JsonObj = Record<string, unknown>;

const isObj = (value: unknown): value is JsonObj =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function eq(a: unknown, b: unknown): boolean {
  try { return canonicalJson(a) === canonicalJson(b); }
  catch { return false; }
}

function empty(v: unknown): boolean {
  return Array.isArray(v) && v.length === 0;
}

function allowedRefs(value: unknown, allowed: readonly string[]): boolean {
  return Array.isArray(value) && value.every(
    (x) => typeof x === 'string' && allowed.includes(x),
  );
}

function exactFields(value: JsonObj, fields: readonly string[]): boolean {
  return Object.keys(value).length === fields.length &&
    fields.every((x) => Object.prototype.hasOwnProperty.call(value, x));
}

function matchesSourceBearingContext(
  actual: unknown,
  current: SeyeonOfflineS0ContextCandidateV1,
  packet: boolean,
): boolean {
  if (!isObj(actual)) return false;
  const messages = actual.recentConversation;
  const memories = packet ? actual.memoryEvidence : actual.retrievedMemories;
  // Native buildSeyeonRendererPacketV2 intentionally includes ONLY memories
  // actually cited by the guarded interpretation. Unused granted Memory is
  // not evidence of an additional source and must not be force-mentioned.
  const interpretation = packet && isObj(actual.interpretation)
    ? actual.interpretation : null;
  const selectedMemories = packet && interpretation &&
      Array.isArray(interpretation.memoryRefsUsed)
    ? current.finalContext.retrievedMemories.filter(
        m => (interpretation.memoryRefsUsed as unknown[]).includes(m.memoryId))
    : current.finalContext.retrievedMemories;
  if (!eq(messages, current.finalContext.recentMessages) ||
      !eq(memories, selectedMemories) ||
      actual.relationship !== null ||
      actual.relationshipSemantics !== null) {
    return false;
  }
  const disclosure = actual.disclosure;
  const integrity = actual.integrity;
  if (!isObj(disclosure) || !isObj(integrity) ||
      !empty(disclosure.retrievedSources) ||
      !empty(integrity.decisions) ||
      integrity.governedPreflightApplied !== true) return false;
  if (packet) {
    const i = actual.interpretation;
    if (!isObj(i) || !isObj(i.notice) || !isObj(i.reveal) ||
        !allowedRefs(i.memoryRefsUsed, current.finalContext.retrievedMemories.map(m => m.memoryId)) ||
        !allowedRefs(i.notice.evidenceRefs, [
          current.currentUserMessage.messageId,
          ...current.finalContext.retrievedMemories.map(m => m.sourceRef),
        ]) ||
        !empty(i.reveal.supportingHistoryRefs)) return false;
  } else {
    const character = actual.character;
    if (!isObj(character) || character.characterId !== 'seyeon') return false;
  }
  return true;
}

/**
 * All comparisons refer to the real provider request object's "input" shape,
 * not a caller-supplied sourceRef or a claimed digest string. Fail-closed.
 * Classification requests are intentionally narrower than interpreter/packet.
 */
export function auditSeyeonOfflineR2ProviderRequestV1(input: Readonly<{
  candidate: SeyeonOfflineS0ContextCandidateV1;
  request: SeyeonStructuredProviderRequestV2;
}>): SeyeonOfflineR2IngressAuditVerdictV1 {
  try {
    const { candidate, request } = input;
    if (admitSeyeonOfflineS0ContextCandidateV1(candidate).state !==
          'eligible_offline_synthetic_only' ||
        request.contractVersion !== 'seyeon-structured-provider-v2' ||
        typeof request.instructions !== 'string' ||
        request.instructions.length === 0 ||
        !isObj(request.responseSchema) ||
        !isObj(request.input)) return HELD;

    const data = request.input;
    switch (request.purpose) {
      case 'integrity_classification':
        if (!exactFields(data, ['characterId','userText']) ||
            data.characterId !== 'seyeon' ||
            data.userText !== candidate.currentUserMessage.text) return HELD;
        break;
      case 'disclosure_classification':
        if (!exactFields(data, ['characterId','userQuestion']) ||
            data.characterId !== 'seyeon' ||
            data.userQuestion !== candidate.currentUserMessage.text) return HELD;
        break;
      case 'turn_interpretation': {
        if (!exactFields(data, ['context','allowedInterpretationVocabulary',
          'allowedReferenceVocabulary']) ||
            !matchesSourceBearingContext(data.context,candidate,false) ||
            !isObj(data.allowedReferenceVocabulary)) return HELD;
        const refs = data.allowedReferenceVocabulary;
        if (!eq(refs.memoryIds,candidate.finalContext.retrievedMemories.map(m=>m.memoryId)) ||
            !eq(refs.noticeEvidenceRefs, [
              candidate.currentUserMessage.messageId,
              ...candidate.finalContext.retrievedMemories.map(m=>m.sourceRef),
            ]) || !empty(refs.historySourceRefs)) return HELD;
        break;
      }
      case 'dialogue_render': {
        if (!exactFields(data, ['packet','allowedRendererOutputVocabulary']) ||
            !matchesSourceBearingContext(data.packet,candidate,true) ||
            !isObj(data.allowedRendererOutputVocabulary) ||
            !empty(data.allowedRendererOutputVocabulary.privateSourceRefs)) return HELD;
        break;
      }
      case 'semantic_review': {
        if (!exactFields(data, ['packet','rendererDraft','expectedUtteranceHash']) ||
            !matchesSourceBearingContext(data.packet,candidate,true) ||
            !isObj(data.rendererDraft) ||
            !empty(data.rendererDraft.privateSourceRefsMentioned)) return HELD;
        break;
      }
      default:
        // Includes event_extraction and future tool/Provider purposes.
        return HELD;
    }

    return Object.freeze({
      state: 'observed_synthetic_only' as const,
      requestDigest: 'sha256:v1:' + createHash('sha256')
        .update(canonicalJson({
          version:SEYEON_OFFLINE_R2_INGRESS_AUDIT_VERSION_V1,
          attemptId:candidate.identity.attemptId,
          request,
        })).digest('hex'),
      permitsProductionProvider: false as const,
      permitsProductionReveal: false as const,
    });
  } catch {
    return HELD;
  }
}

/** Prevents synthetic-provider invocation when the request's structured
 * source shape drifted AFTER the initial S0 context selection.
 * Caller-supplied candidate is NOT an authorized Owner Proof.
 */
export function createSeyeonOfflineR2AuditedSyntheticProviderV1(input: Readonly<{
  candidate: SeyeonOfflineS0ContextCandidateV1;
  delegate: SeyeonStructuredProviderPortV2;
}>): SeyeonStructuredProviderPortV2 {
  return Object.freeze({
    providerKey: input.delegate.providerKey,
    modelKey: input.delegate.modelKey,
    generate(request: SeyeonStructuredProviderRequestV2) {
      if (auditSeyeonOfflineR2ProviderRequestV1({
        candidate: input.candidate,request,
      }).state !== 'observed_synthetic_only') {
        throw new Error('Seyeon offline R2 Provider ingress source closure held');
      }
      return input.delegate.generate(request);
    },
  });
}
