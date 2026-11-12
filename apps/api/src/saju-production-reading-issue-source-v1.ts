import { verify, type KeyObject } from 'node:crypto';
import { hashSajuHeldSourceProofRequestV1 as hashJson } from './saju-held-source-proof-verifier-v1.js';
import type {
  SajuOfficialSourceVerificationPortV1,
  SajuProductionIssueProofEnvelopeV1,
} from './saju-official-reading-issuer-db-persistence-v1.js';
import {
  admitSajuCanonicalReaderSourceV1,
  projectSajuCanonicalReaderGroundingV1,
  type SajuCanonicalReaderSourceV1,
} from './saju-canonical-reader-source-v1.js';
import type { SajuDomain } from '../../../packages/contracts/src/index.js';
import {
  createSajuProductionReadingHttpAdapterV1,
  SAJU_PRODUCTION_ISSUE_BIRTH_HASH_V1,
  SAJU_PRODUCTION_ISSUE_RELEASE_REF_V1,
  SajuProductionReadingHttpAdapterErrorV1,
  type SajuPreparedProductionReadingContextV1,
  type SajuProductionReadingHttpAdapterConfigV1,
  type SajuProductionReadingHttpAdapterV1,
} from './saju-production-reading-http-adapter.js';

const RELEASE_HEADER = 'x-myeongha-reading-release';
const PROOF_HEADER = 'x-myeonghwa-production-issue-proof';
const READER_SOURCE_HEADER = 'x-myeongha-reader-source';
const READER_SOURCE_VERSION = 'canonical-v1';
const VERSION = 'myeonghwa-production-reading-issue-proof-v1';
const SIGNATURE_DOMAIN = 'myeongha/saju/production-reading-issue/v1\0';
const UUID = /^[a-f0-9]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HASH = /^[a-f0-9]{64}$/u;
const TOKEN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/u;
const MAX_PROOF_AGE_MS = 120_000;
const MAX_FUTURE_SKEW_MS = 5_000;

export interface SajuProductionIssueSourceConfigV1
  extends Omit<SajuProductionReadingHttpAdapterConfigV1, 'admissionPort'> {
  readonly authorityHash: string;
  readonly issuer: string;
  readonly audience: string;
  readonly keyId: string;
  readonly verificationKey: KeyObject;
  readonly requireCanonicalReaderSource?: boolean;
}

export type SajuProductionIssueProofTrustV1 = Pick<SajuProductionIssueSourceConfigV1,
  'authorityHash' | 'issuer' | 'audience' | 'keyId' | 'verificationKey'>;

function record(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === 'object' && !Array.isArray(input);
}

function parseProof(header: string | null): unknown {
  if (header === null || header.length > 4_096 || !/^[a-zA-Z0-9_-]+$/u.test(header)) return null;
  try {
    return JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function authenticateIssueProof(
  proof: unknown,
  trust: SajuProductionIssueProofTrustV1,
  acceptedAtMs: number,
  maxAgeMs: number,
): SajuProductionIssueProofEnvelopeV1 | null {
  if (!record(proof) || Object.keys(proof).length !== 2) return null;
  const { payload, signature } = proof;
  if (!record(payload) ||
      (payload.readerSourceHash === undefined
        ? Object.keys(payload).length !== 13
        : Object.keys(payload).length !== 14 ||
          typeof payload.readerSourceHash !== 'string' || !HASH.test(payload.readerSourceHash)) ||
      typeof signature !== 'string' || !/^[a-zA-Z0-9_-]{86}$/u.test(signature)) return null;
  if (
    payload.version !== VERSION || payload.issuer !== trust.issuer || payload.audience !== trust.audience ||
    payload.keyId !== trust.keyId || payload.authorityHash !== trust.authorityHash || !HASH.test(trust.authorityHash) ||
    trust.verificationKey.type !== 'public' || trust.verificationKey.asymmetricKeyType !== 'ed25519' ||
    typeof payload.issuedAtMs !== 'number' || !Number.isSafeInteger(payload.issuedAtMs) ||
    !Number.isSafeInteger(acceptedAtMs) || payload.issuedAtMs < acceptedAtMs - maxAgeMs ||
    payload.issuedAtMs > acceptedAtMs + MAX_FUTURE_SKEW_MS ||
    !verify(null, Buffer.from(SIGNATURE_DOMAIN + hashJson(payload)), trust.verificationKey, Buffer.from(signature, 'base64url'))
  ) return null;
  return Object.freeze({ payload: Object.freeze({ ...payload }), signature });
}

function bindCanonicalSource(
  payload: Readonly<Record<string, unknown>>,
  source: unknown,
  nativeResponse: Record<string, unknown>,
  engineVersion: string,
): SajuCanonicalReaderSourceV1 | null {
  if (payload.readerSourceHash === undefined || source === undefined ||
    hashJson(source) !== payload.readerSourceHash) return null;
  return admitSajuCanonicalReaderSourceV1(source, nativeResponse, engineVersion);
}

/** Verify a receipt accepted at issuance, then reconstruct the native source from the exact archive. */
export function verifyArchivedSajuProductionIssueProofV1(input: Readonly<{
  receipt: unknown;
  trusts: readonly SajuProductionIssueProofTrustV1[];
  readingId: string;
  storedResponse: unknown;
  storedResponseHash: string;
}>): Readonly<{
  sourceProofFingerprint: string;
  nativeSourceResponseHash: string;
  executionAttemptId: string;
  readerSource?: SajuCanonicalReaderSourceV1;
}> | null {
  const { receipt, storedResponse, storedResponseHash } = input;
  if (!record(receipt) || !record(storedResponse) || !record(storedResponse.reading) ||
    storedResponse.state !== 'delivered' || storedResponse.reading.readingId !== input.readingId ||
    receipt.storedResponseHash !== storedResponseHash || typeof receipt.acceptedAt !== 'string' ||
    typeof receipt.nativeReadingId !== 'string' || typeof receipt.executionAttemptId !== 'string' ||
    !UUID.test(receipt.executionAttemptId) || typeof receipt.sourceRequestHash !== 'string' ||
    !HASH.test(receipt.sourceRequestHash) || typeof receipt.releaseRef !== 'string' ||
    !SAJU_PRODUCTION_ISSUE_RELEASE_REF_V1.test(receipt.releaseRef) ||
    typeof receipt.engineVersion !== 'string' || typeof receipt.externalRequestRef !== 'string' ||
    'sha256:v1:' + hashJson(storedResponse) !== storedResponseHash) return null;
  if (!record(receipt.proof) || !record(receipt.proof.payload)) return null;
  const { issuer, keyId, authorityHash } = receipt.proof.payload;
  const trust = input.trusts.find(entry =>
    entry.issuer === issuer && entry.keyId === keyId && entry.authorityHash === authorityHash,
  );
  if (trust === undefined) return null;
  // The DB write follows live signature verification in the same issuance transaction.
  const { readerSource, ...signedEnvelope } = receipt.proof;
  const proof = authenticateIssueProof(signedEnvelope, trust, Date.parse(receipt.acceptedAt), MAX_PROOF_AGE_MS + 5_000);
  if (proof === null) return null;
  const { payload } = proof;
  const native = { ...storedResponse, reading: { ...storedResponse.reading, readingId: receipt.nativeReadingId } };
  const nativeHash = hashJson(native);
  if (payload.nativeReadingId !== receipt.nativeReadingId || payload.engineVersion !== receipt.engineVersion ||
    payload.executionAttemptId !== receipt.executionAttemptId || payload.externalRequestRef !== receipt.externalRequestRef ||
    payload.releaseRef !== receipt.releaseRef || payload.requestBodyHash !== receipt.sourceRequestHash ||
    payload.responseBodyHash !== nativeHash) return null;
  const canonicalSource = bindCanonicalSource(payload, readerSource, native, receipt.engineVersion);
  if ((readerSource !== undefined || payload.readerSourceHash !== undefined) && canonicalSource === null) return null;
  return Object.freeze({
    sourceProofFingerprint: 'sha256:v1:' + hashJson(receipt.proof),
    nativeSourceResponseHash: 'sha256:v1:' + nativeHash,
    executionAttemptId: receipt.executionAttemptId,
    ...(canonicalSource === null ? {} : { readerSource: canonicalSource }),
  });
}

/** The private key belongs to Saju. This factory verifies the raw admitted response before issuance. */
export function createSajuProductionReadingIssueSourceV1(config: SajuProductionIssueSourceConfigV1): {
  adapter: SajuProductionReadingHttpAdapterV1;
  sourceVerifier: SajuOfficialSourceVerificationPortV1;
} {
  const { authorityHash, issuer, audience, keyId, verificationKey, baseUrl } = config;
  if (
    !baseUrl.startsWith('https://') || verificationKey.type !== 'public' ||
    verificationKey.asymmetricKeyType !== 'ed25519' || !HASH.test(authorityHash) ||
    ![issuer, audience, keyId].every((value) => TOKEN.test(value))
  ) {
    throw new SajuProductionReadingHttpAdapterErrorV1(
      'INVALID_CONFIGURATION', 'Invalid Saju Production Reading issue source configuration.',
    );
  }
  const fetchImpl = config.fetchImpl ?? ((url, init) => fetch(url, init));
  // Reject transport configuration errors before an issuer can allocate a DB attempt.
  createSajuProductionReadingHttpAdapterV1(config);
  const proofs = new WeakMap<object, {
    context: SajuPreparedProductionReadingContextV1;
    proof: unknown;
    readerSource: unknown;
    externalRequestRef: string;
  }>();

  return {
    adapter: {
      async requestReading() {
        throw new SajuProductionReadingHttpAdapterErrorV1(
          'INVALID_READING_REQUEST', 'Saju Production Reading requires a prepared issuance attempt.',
        );
      },
      async requestPreparedReading(request, context) {
        if (
          !UUID.test(context.executionAttemptId) || !UUID.test(context.sourceBirthRevisionId) ||
          !SAJU_PRODUCTION_ISSUE_BIRTH_HASH_V1.test(context.sourceBirthInputHash) ||
          !SAJU_PRODUCTION_ISSUE_RELEASE_REF_V1.test(context.releaseRef) ||
          request.reading.targetPersonRef !== undefined
        ) {
          throw new SajuProductionReadingHttpAdapterErrorV1(
            'INVALID_READING_REQUEST', 'Invalid prepared Saju Production Reading context.',
          );
        }
        const binding = { ...context };
        let header: string | null = null;
        let readerSource: unknown;
        const transport = createSajuProductionReadingHttpAdapterV1({
          ...config,
          fetchImpl: async (url, init) => {
            const response = await fetchImpl(url, {
              ...init,
              headers: {
                ...init.headers,
                [RELEASE_HEADER]: binding.releaseRef,
                ...(config.requireCanonicalReaderSource === true ? { [READER_SOURCE_HEADER]: READER_SOURCE_VERSION } : {}),
              },
            });
            header = response.headers.get(PROOF_HEADER);
            return response;
          },
          admissionPort: {
            admit(payload) {
              if (!record(payload)) throw new Error('Invalid Saju issuance response.');
              const { readerSource: privateSource, ...readingResponse } = payload;
              readerSource = privateSource;
              return readingResponse;
            },
          },
        });
        if (transport.requestReadingWithSourceRef === undefined) {
          throw new Error('Saju prepared transport did not provide the A4 source ref boundary.');
        }
        const attested = await transport.requestReadingWithSourceRef(request, binding);
        if (record(attested.response)) proofs.set(attested.response, {
          context: binding, proof: parseProof(header), readerSource, externalRequestRef: attested.externalRequestRef,
        });
        return attested;
      },
    },
    sourceVerifier: {
      async verifyProductionIssue({ sourceResponse, executedRequest, executionAttemptId, sourceBirthRevisionId, dbReadingId }) {
        if (!record(sourceResponse) || sourceResponse.state !== 'delivered' || !record(sourceResponse.reading)) {
          return null;
        }
        const entry = proofs.get(sourceResponse);
        proofs.delete(sourceResponse);
        if (!entry) return null;
        const { context, externalRequestRef } = entry;
        const issueProof = authenticateIssueProof(entry.proof, config, Date.now(), MAX_PROOF_AGE_MS);
        if (issueProof === null) return null;
        const { payload } = issueProof;
        const requestHash = hashJson(executedRequest);
        const responseHash = hashJson(sourceResponse);
        if (
          executionAttemptId !== context.executionAttemptId || payload.executionAttemptId !== executionAttemptId ||
          payload.externalRequestRef !== externalRequestRef ||
          sourceBirthRevisionId !== context.sourceBirthRevisionId || payload.releaseRef !== context.releaseRef ||
          payload.requestBodyHash !== requestHash || payload.responseBodyHash !== responseHash ||
          typeof payload.nativeReadingId !== 'string' || payload.nativeReadingId !== sourceResponse.reading.readingId ||
          typeof payload.engineVersion !== 'string' || !TOKEN.test(payload.engineVersion)
        ) return null;
        const canonicalSource = bindCanonicalSource(payload, entry.readerSource, sourceResponse, payload.engineVersion);
        if ((config.requireCanonicalReaderSource === true || entry.readerSource !== undefined ||
          payload.readerSourceHash !== undefined) && canonicalSource === null) return null;
        if (canonicalSource !== null) {
          try {
            projectSajuCanonicalReaderGroundingV1(canonicalSource, {
              readingId: dbReadingId,
              storedResponseHash: 'sha256:v1:' + hashJson({
                ...sourceResponse, reading: { ...sourceResponse.reading, readingId: dbReadingId },
              }),
              sajuDomain: canonicalSource.grounding.readingDomain as SajuDomain,
            });
          } catch { return null; }
        }
        return {
          state: 'production_source_verified',
          nativeReadingId: payload.nativeReadingId,
          sourceRequestHash: requestHash,
          sourceResponseHash: responseHash,
          sourceBirthRevisionId,
          sourceBirthInputHash: context.sourceBirthInputHash,
          engineVersion: payload.engineVersion,
          externalRequestRef,
          issueProof: canonicalSource === null ? issueProof : Object.freeze({ ...issueProof, readerSource: canonicalSource }),
        };
      },
    },
  };
}
