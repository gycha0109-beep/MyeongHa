import { randomBytes, verify, type KeyObject } from 'node:crypto';
import type { readApprovedSajuPairIssueScopeV1 } from './postgres-approved-saju-issue-scope-v1.js';
import { hashSajuHeldSourceProofRequestV1 as hashJson } from './saju-held-source-proof-verifier-v1.js';
import { readBoundedUpstreamJsonTextV1 } from './upstream-json-response-resource.js';

const VERSION = 'myeonghwa-held-pair-review-v1';
const PATH = '/api/preview/compatibility-evidence';
const HASH = /^[a-f0-9]{64}$/u;
type Pair = NonNullable<Awaited<ReturnType<typeof readApprovedSajuPairIssueScopeV1>>>['request'];

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const SERVICE_RULES = new Set([
  'T10-SERVICE-DAY-UNKNOWN',
  'T10-SERVICE-DAY-SIX-COMBINATION',
  'T10-SERVICE-DAY-CLASH',
  'T10-SERVICE-DAY-NO-SIX-OR-CLASH',
  'T10-SERVICE-MIXED-POSITIONS',
  'T10-SERVICE-BOUNDED-SCOPE',
]);

/** Only accept the signed, non-public MyeongHa interpretation vocabulary
 * with both original chart identities and exact structural fact references. */
function validHeldInternalPairInterpretation(evidence: Readonly<Record<string, unknown>>): boolean {
  const meaning = evidence.internalServiceInterpretation;
  const review = evidence.readingReview;
  if (!record(meaning) || !record(review) || !Array.isArray(review.charts) ||
      !Array.isArray(meaning.charts) || meaning.charts.length !== 2 ||
      !Array.isArray(meaning.sentences) || meaning.sentences.length < 2 ||
      meaning.sentences.length > 6 || !Array.isArray(evidence.matches) ||
      meaning.version !== 'saju-t10-internal-service-interpretation-v1' ||
      meaning.lifecycle !== 'internal_policy_trial' ||
      meaning.policyId !== 'myeongha-t10-internal-relational-explanation-v1' ||
      meaning.policyVersion !== '2026-11-13' ||
      meaning.adoption !== 'project_owner_service_lexicon' ||
      meaning.academicThirdPartyApprovalRequired !== false ||
      meaning.ruleCoverage !== 'day_branch_structures_only' ||
      meaning.readyForOfficialIssue !== false ||
      meaning.mayPublish !== false || meaning.maySell !== false ||
      JSON.stringify(meaning.charts) !== JSON.stringify(review.charts)) return false;

  const knownPaths = new Set<string>();
  for (const item of evidence.matches) {
    if (!record(item) || !record(item.subject) || !record(item.target) ||
        typeof item.subject.factPath !== 'string' ||
        typeof item.target.factPath !== 'string') return false;
    knownPaths.add(item.subject.factPath);
    knownPaths.add(item.target.factPath);
  }
  const usedRules = new Set<string>();
  for (const item of meaning.sentences) {
    if (!record(item) || typeof item.ruleId !== 'string' ||
        !SERVICE_RULES.has(item.ruleId) || usedRules.has(item.ruleId) ||
        typeof item.paragraph !== 'string' || item.paragraph.trim().length === 0 ||
        item.paragraph.length > 1500 ||
        item.interpretationOwner !== 'myeongha_internal_service' ||
        item.individualOutcomeClaimed !== false ||
        !Array.isArray(item.observedFactPaths) ||
        item.observedFactPaths.some(path => typeof path !== 'string' || !knownPaths.has(path))) return false;
    usedRules.add(item.ruleId);
  }
  return usedRules.has('T10-SERVICE-BOUNDED-SCOPE') &&
    [...usedRules].some(rule => rule.startsWith('T10-SERVICE-DAY-'));
}

function discard(response: Response): null {
  void response.body?.cancel().catch(() => undefined);
  return null;
}

/** Evidence transport for a held comparison. Official issuance uses a separate authority. */
export function createSajuHeldPairReviewPortV1(input: Readonly<{
  origin: string;
  bearerToken: string;
  keyId: string;
  verificationKey: KeyObject;
  fetchImpl?: typeof fetch;
}>) {
  const origin = new URL(input.origin);
  if (origin.origin !== input.origin || origin.protocol !== 'https:' ||
    !/^[a-zA-Z0-9._:-]{3,128}$/u.test(input.keyId) || !/^\S{24,1024}$/u.test(input.bearerToken) ||
    input.verificationKey.type !== 'public' || input.verificationKey.asymmetricKeyType !== 'ed25519') {
    throw new TypeError('The held comparison review requires its private HTTPS host and verification key.');
  }
  const { bearerToken, keyId, verificationKey, fetchImpl = fetch } = input;
  const url = new URL(PATH, origin).toString();
  return Object.freeze({
    async inspectSource(pair: Pair) {
      const body = { birth: pair.birth, partnerBirth: pair.partnerBirth, candidateScope: 'traditional_marital_palace_comparison' };
      const requestJson = JSON.stringify(body);
      const nonce = randomBytes(32).toString('base64url');
      const signal = AbortSignal.timeout(10_000);
      const response = await fetchImpl(url, {
        method: 'POST', redirect: 'error', cache: 'no-store', signal,
        headers: { Authorization: 'Bearer ' + bearerToken, 'Content-Type': 'application/json',
          'x-myeongha-pair-review-nonce': nonce },
        body: requestJson,
      });
      const encoded = response.headers.get('x-myeonghwa-pair-review-proof');
      if (!response.ok || response.headers.get('x-myeonghwa-reading-lifecycle') !== 'preview' ||
        encoded === null || !/^[a-zA-Z0-9_-]{1,2048}$/u.test(encoded)) {
        return discard(response);
      }
      let proof: unknown;
      try {
        proof = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      } catch {
        return discard(response);
      }
      if (!record(proof) || Object.keys(proof).length !== 2 || !record(proof.payload) ||
        typeof proof.signature !== 'string' || !/^[a-zA-Z0-9_-]{86}$/u.test(proof.signature)) {
        return discard(response);
      }
      const { payload, signature } = proof;
      if (Object.keys(payload).length !== 6 || payload.version !== VERSION || payload.keyId !== keyId ||
        payload.state !== 'held' || payload.nonce !== nonce || payload.requestBodyHash !== hashJson(JSON.parse(requestJson)) ||
        typeof payload.responseBodyHash !== 'string' || !HASH.test(payload.responseBodyHash) ||
        !verify(null, Buffer.from(VERSION + '\0' + hashJson(payload)), verificationKey, Buffer.from(signature, 'base64url'))) {
        return discard(response);
      }
      const result: unknown = JSON.parse(await readBoundedUpstreamJsonTextV1(response, {
        maximumBodyBytes: 128 * 1024, signal,
      }));
      if (!record(result) || hashJson(result) !== payload.responseBodyHash ||
        result.lifecycle !== 'internal_preview_only' || result.maySell !== false || result.mayPublish !== false ||
        result.mayPersist !== false || result.generatedInterpretationClaims !== false ||
        !record(result.evidence) || !record(result.evidence.readingReview) ||
        result.evidence.readingReview.state !== 'held' ||
        result.evidence.readingReview.actualCompatibilityReadingReady !== false ||
        result.evidence.readingReview.mayGrantOfficialAuthority !== false ||
        !validHeldInternalPairInterpretation(result.evidence)) return null;
      return result;
    },
  });
}
