import { createHash } from 'node:crypto';
import {
  admitSeyeonRendererDraftV2,
  buildSeyeonRendererPacketV2,
  canonicalJson,
  guardSeyeonRendererOutputV2,
  guardSeyeonRiskBearingActionCausalityV1,
  guardSeyeonTurnInterpretationV2,
  hashSeyeonRendererUtteranceV2,
  type SeyeonDialogueEnvelopeV2,
  type SeyeonRendererPacketV2,
  type SeyeonRuntimeContextV2,
} from '../../../packages/domain/src/index.js';
import type { CharacterGovernedPreflightResultV1 } from './character-governed-preflight-v1.js';
import {
  buildSeyeonRendererRequestV2,
  buildSeyeonSemanticReviewRequestV2,
  buildSeyeonTurnInterpreterRequestV2,
  type SeyeonStructuredProviderPortV2,
  type SeyeonStructuredProviderRequestV2,
} from './seyeon-character-runtime-v2.js';
import type { SeyeonOfflineS0ContextCandidateV1 } from './seyeon-offline-s0-context-admission-v1.js';
import { observeSeyeonOfflineR2PostPreflightClosureV1 } from './seyeon-offline-r2-post-preflight-closure-v1.js';
import { auditSeyeonOfflineR2ProviderRequestV1 } from './seyeon-offline-r2-provider-ingress-audit-v1.js';

/**
 * R2 synthetic-only proof of ACTUAL generated output ancestry.
 *
 * Unlike a caller-supplied five-request expectation set, this harness builds
 * each subsequent native request from the guarded result of the preceding
 * synthetic delegate. It is neither DB-Owner authority nor wire attestation.
 * Never attach it to Production Chat or use a snapshot as a reveal token.
 */
export const SEYEON_OFFLINE_R2_DERIVED_OUTPUT_LINEAGE_V1 =
  'seyeon-offline-r2-derived-output-lineage-v1' as const;

type Stage = 'turn_interpretation' | 'dialogue_render' | 'semantic_review';
type State = Stage | 'complete' | 'held';

type Receipt = Readonly<{
  stage: Stage;
  requestDigest: string;
  resultDigest: string;
  priorReceiptDigest: string | null;
  receiptDigest: string;
}>;

function fingerprint(value: unknown): string {
  return 'sha256:v1:' +
    createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function same(a: unknown, b: unknown): boolean {
  try {
    return canonicalJson(a) === canonicalJson(b);
  } catch {
    return false;
  }
}

export function createSeyeonOfflineR2DerivedOutputLineageV1(input: Readonly<{
  candidate: SeyeonOfflineS0ContextCandidateV1;
  preflight: CharacterGovernedPreflightResultV1;
  actualContext: SeyeonRuntimeContextV2;
  delegate: SeyeonStructuredProviderPortV2;
}>) {
  const original = observeSeyeonOfflineR2PostPreflightClosureV1(input);
  if (original.state !== 'post_preflight_context_observed_synthetic_only' ||
      !input.delegate ||
      typeof input.delegate.generate !== 'function') {
    throw new Error('R2 derived-output lineage initial closure held');
  }

  let state: State = 'turn_interpretation';
  let inFlight = false;
  let expectedRequest = buildSeyeonTurnInterpreterRequestV2(input.actualContext);
  let packet: SeyeonRendererPacketV2 | null = null;
  let packetDigest: string | null = null;
  let rendererDraft: unknown = null;
  let rendererDraftDigest: string | null = null;
  let envelope: SeyeonDialogueEnvelopeV2 | null = null;
  const receipts: Receipt[] = [];

  function appendReceipt(stage: Stage, request: unknown, result: unknown) {
    const priorReceiptDigest = receipts.at(-1)?.receiptDigest ?? null;
    const receipt: Receipt = Object.freeze({
      stage,
      requestDigest: fingerprint({stage,request}),
      resultDigest: fingerprint({stage,result}),
      priorReceiptDigest,
      receiptDigest: fingerprint({
        version: SEYEON_OFFLINE_R2_DERIVED_OUTPUT_LINEAGE_V1,
        attemptId: input.candidate.identity.attemptId,
        stage,request,result,priorReceiptDigest,
      }),
    });
    receipts.push(receipt);
  }

  const provider: SeyeonStructuredProviderPortV2 = Object.freeze({
    providerKey: input.delegate.providerKey,
    modelKey: input.delegate.modelKey,
    async generate(request: SeyeonStructuredProviderRequestV2) {
      // Reject retries, concurrent sibling calls, unknown stages and drift
      // BEFORE calling the delegate. A failed/invalid response is terminal.
      if (inFlight || state === 'complete' || state === 'held') {
        throw new Error('R2 derived-output lineage held');
      }
      const stage = state;
      inFlight = true;
      try {
        const current = observeSeyeonOfflineR2PostPreflightClosureV1(input);
        if (current.state !== 'post_preflight_context_observed_synthetic_only' ||
            current.contextDigest !== original.contextDigest ||
            current.interpreterRequestDigest !== original.interpreterRequestDigest ||
            !same(request, expectedRequest) ||
            request.purpose !== stage ||
            auditSeyeonOfflineR2ProviderRequestV1({
              candidate: input.candidate, request,
            }).state !== 'observed_synthetic_only' ||
            (stage !== 'turn_interpretation' &&
             (packet === null || packetDigest === null ||
              fingerprint(packet) !== packetDigest)) ||
            (stage === 'semantic_review' &&
             (rendererDraft === null || rendererDraftDigest === null ||
              fingerprint(rendererDraft) !== rendererDraftDigest))) {
          throw new Error('R2 derived-output request/closure mismatch');
        }

        const raw = await input.delegate.generate(request);
        // Recheck mutable source/Preflight after async delegate, before
        // admitting the output or computing a downstream request.
        const after = observeSeyeonOfflineR2PostPreflightClosureV1(input);
        if (after.state !== 'post_preflight_context_observed_synthetic_only' ||
            after.contextDigest !== original.contextDigest ||
            after.interpreterRequestDigest !== original.interpreterRequestDigest ||
            !same(request, expectedRequest)) {
          throw new Error('R2 derived-output closure changed during generation');
        }

        if (stage === 'turn_interpretation') {
          const interpretation = guardSeyeonTurnInterpretationV2({
            rawOutput: raw, context: input.actualContext,
          });
          const riskCausality = guardSeyeonRiskBearingActionCausalityV1({
            context: input.actualContext, interpretation,
          });
          packet = buildSeyeonRendererPacketV2({
            context: input.actualContext, interpretation, riskCausality,
          });
          packetDigest = fingerprint(packet);
          expectedRequest = buildSeyeonRendererRequestV2(packet);
          appendReceipt(stage, request, {interpretation,riskCausality,packet});
          state = 'dialogue_render';
        } else if (stage === 'dialogue_render') {
          if (packet === null) throw new Error('R2 missing interpreter packet');
          rendererDraft = admitSeyeonRendererDraftV2({
            rawOutput: raw, packet,
          });
          rendererDraftDigest = fingerprint(rendererDraft);
          const utteranceHash = hashSeyeonRendererUtteranceV2(
            (rendererDraft as {utterance:string}).utterance,
          );
          expectedRequest = buildSeyeonSemanticReviewRequestV2({
            packet, rendererDraft, utteranceHash,
          });
          appendReceipt(stage, request, {rendererDraft,utteranceHash});
          state = 'semantic_review';
        } else {
          if (packet === null || rendererDraft === null) {
            throw new Error('R2 missing renderer predecessor');
          }
          envelope = guardSeyeonRendererOutputV2({
            rawOutput: rendererDraft, packet, semanticReview: raw,
          });
          appendReceipt(stage, request, {envelope});
          state = 'complete';
        }
        return raw;
      } catch {
        state = 'held';
        envelope = null;
        throw new Error('R2 derived-output lineage held');
      } finally {
        inFlight = false;
      }
    },
  });

  return Object.freeze({
    provider,
    /**
     * Offline unkeyed fingerprints, not an authenticated Grant, StageReceipt,
     * HTTP disclosure decision, or proof of serialized Provider wire bytes.
     */
    snapshot() {
      return Object.freeze({
        schemaVersion: SEYEON_OFFLINE_R2_DERIVED_OUTPUT_LINEAGE_V1,
        state,
        completedPurposes: Object.freeze(receipts.map(receipt => receipt.stage)),
        receipts: Object.freeze([...receipts]),
        envelopeDigest: state === 'complete' && envelope !== null
          ? fingerprint(envelope) : null,
        permitsProductionProvider: false as const,
        permitsProductionReveal: false as const,
      });
    },
  });
}
