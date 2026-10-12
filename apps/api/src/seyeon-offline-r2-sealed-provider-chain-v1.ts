import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import type {
  SeyeonStructuredProviderPortV2,
  SeyeonStructuredProviderRequestV2,
} from './seyeon-character-runtime-v2.js';
import type { SeyeonOfflineS0ContextCandidateV1 } from './seyeon-offline-s0-context-admission-v1.js';
import { auditSeyeonOfflineR2ProviderRequestV1 } from './seyeon-offline-r2-provider-ingress-audit-v1.js';

/**
 * G0 R2 OFFLINE TEST HARNESS. A complete, ordered-semantics fingerprint of
 * the native *entire* structured Provider request, not just sourceRef arrays.
 *
 * The caller that supplied expectedRequests can lie; this is NOT proof of
 * Owner authorization, actual signed Bible, unknown private-text lineage,
 * DB Pin, production Provider admission or current rights at Reveal.
 *
 * Workloads with dynamic output must build a new offline expectation set from
 * synthetic test results; NEVER install this harness in Production Chat.
 */
export const SEYEON_OFFLINE_R2_SEALED_CHAIN_VERSION_V1 =
  'seyeon-offline-r2-sealed-provider-chain-v1' as const;

export const SEYEON_OFFLINE_R2_FIVE_PURPOSES_V1 = Object.freeze([
  'integrity_classification',
  'disclosure_classification',
  'turn_interpretation',
  'dialogue_render',
  'semantic_review',
] as const);

type Stage = (typeof SEYEON_OFFLINE_R2_FIVE_PURPOSES_V1)[number];

type SealedRecord = Readonly<{
  stage: Stage;
  digest: string;
}>;

export interface SeyeonOfflineR2SealedProviderChainV1 {
  readonly provider: SeyeonStructuredProviderPortV2;
  /**
   * Unkeyed synthetic digest only; the fact that this method reports "all
   * completed" DOES NOT authorize any Production Provider/HTTP Reveal.
   */
  snapshot(): Readonly<{
    schemaVersion: typeof SEYEON_OFFLINE_R2_SEALED_CHAIN_VERSION_V1;
    completedPurposes: readonly Stage[];
    sealedRequestDigests: readonly SealedRecord[];
    permitsProductionProvider: false;
    permitsProductionReveal: false;
  }>;
}

function digest(value: unknown): string {
  return 'sha256:v1:' +
    createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function stageOf(purpose: string): Stage | null {
  return (SEYEON_OFFLINE_R2_FIVE_PURPOSES_V1 as readonly string[])
    .includes(purpose) ? purpose as Stage : null;
}

function prerequisites(stage: Stage): readonly Stage[] {
  switch (stage) {
    case 'integrity_classification':
    case 'disclosure_classification':
      return [];
    case 'turn_interpretation':
      return ['integrity_classification', 'disclosure_classification'];
    case 'dialogue_render':
      return ['turn_interpretation'];
    case 'semantic_review':
      return ['dialogue_render'];
  }
}

/**
 * The sealed request set MUST be assembled using the actual native request
 * builders in a synthetic fixture; the two Preflight classifiers may finish
 * in either order. Every other stage depends on its predecessor completing.
 */
export function createSeyeonOfflineR2SealedProviderChainV1(input: Readonly<{
  candidate: SeyeonOfflineS0ContextCandidateV1;
  expectedRequests: readonly SeyeonStructuredProviderRequestV2[];
  delegate: SeyeonStructuredProviderPortV2;
}>): SeyeonOfflineR2SealedProviderChainV1 {
  if (!Array.isArray(input.expectedRequests) ||
      input.expectedRequests.length !== SEYEON_OFFLINE_R2_FIVE_PURPOSES_V1.length ||
      !input.delegate || typeof input.delegate.generate !== 'function') {
    throw new Error('R2 offline request chain requires all five native stages');
  }

  const sealed = new Map<Stage, string>();
  for (const request of input.expectedRequests) {
    const stage = stageOf(request?.purpose ?? '');
    if (stage === null || sealed.has(stage) ||
        auditSeyeonOfflineR2ProviderRequestV1({
          candidate: input.candidate, request,
        }).state !== 'observed_synthetic_only') {
      throw new Error('R2 offline request chain contains unapproved or duplicate structured stage');
    }
    sealed.set(stage, digest({
      version: SEYEON_OFFLINE_R2_SEALED_CHAIN_VERSION_V1,
      attemptId: input.candidate.identity.attemptId,
      subjectId: input.candidate.identity.subjectId,
      providerKey: input.delegate.providerKey,
      modelKey: input.delegate.modelKey,
      request,
    }));
  }

  const dispatched = new Set<Stage>();
  const completed = new Set<Stage>();
  const provider = Object.freeze({
    providerKey: input.delegate.providerKey,
    modelKey: input.delegate.modelKey,
    async generate(request: SeyeonStructuredProviderRequestV2) {
      const stage = stageOf(request?.purpose ?? '');
      if (stage === null || dispatched.has(stage) ||
          prerequisites(stage).some(p => !completed.has(p)) ||
          auditSeyeonOfflineR2ProviderRequestV1({
            candidate: input.candidate, request,
          }).state !== 'observed_synthetic_only') {
        throw new Error('R2 offline Provider chain held before dispatch');
      }
      const expected = sealed.get(stage);
      let actual: string;
      try {
        actual = digest({
          version: SEYEON_OFFLINE_R2_SEALED_CHAIN_VERSION_V1,
          attemptId: input.candidate.identity.attemptId,
          subjectId: input.candidate.identity.subjectId,
          providerKey: input.delegate.providerKey,
          modelKey: input.delegate.modelKey,
          request,
        });
      } catch {
        throw new Error('R2 offline Provider chain request could not be sealed');
      }
      if (expected === undefined || actual !== expected) {
        throw new Error('R2 offline Provider full-request fingerprint mismatch');
      }

      // At-most-once per stage, including failed calls. No paid retries.
      dispatched.add(stage);
      const result = await input.delegate.generate(request);
      completed.add(stage);
      return result;
    },
  } satisfies SeyeonStructuredProviderPortV2);

  return Object.freeze({
    provider,
    snapshot() {
      return Object.freeze({
        schemaVersion: SEYEON_OFFLINE_R2_SEALED_CHAIN_VERSION_V1,
        completedPurposes: Object.freeze(
          SEYEON_OFFLINE_R2_FIVE_PURPOSES_V1.filter(stage => completed.has(stage)),
        ),
        sealedRequestDigests: Object.freeze(
          SEYEON_OFFLINE_R2_FIVE_PURPOSES_V1.map(stage =>
            Object.freeze({ stage, digest: sealed.get(stage)! }),
          ),
        ),
        permitsProductionProvider: false as const,
        permitsProductionReveal: false as const,
      });
    },
  });
}
