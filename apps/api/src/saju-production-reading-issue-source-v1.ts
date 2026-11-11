import { verify, type KeyObject } from 'node:crypto';
import { hashSajuHeldSourceProofRequestV1 as hashJson } from './saju-held-source-proof-verifier-v1.js';
import type { SajuOfficialSourceVerificationPortV1 } from './saju-official-reading-issuer-db-persistence-v1.js';
import {
  createSajuProductionReadingHttpAdapterV1,
  SAJU_PRODUCTION_ISSUE_BIRTH_HASH_V1,
  SAJU_PRODUCTION_ISSUE_RELEASE_REF_V1,
  SajuProductionReadingHttpAdapterErrorV1,
  type SajuPreparedProductionReadingContextV1,
  type SajuProductionReadingHttpAdapterConfigV1,
  type SajuProductionReadingHttpAdapterV1,
} from './saju-production-reading-http-adapter.js';

const ATTEMPT_HEADER = 'x-myeongha-reading-attempt';
const RELEASE_HEADER = 'x-myeongha-reading-release';
const PROOF_HEADER = 'x-myeonghwa-production-issue-proof';
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
}

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
        const transport = createSajuProductionReadingHttpAdapterV1({
          ...config,
          fetchImpl: async (url, init) => {
            const response = await fetchImpl(url, {
              ...init,
              headers: {
                ...init.headers,
                [ATTEMPT_HEADER]: binding.executionAttemptId,
                [RELEASE_HEADER]: binding.releaseRef,
              },
            });
            header = response.headers.get(PROOF_HEADER);
            return response;
          },
        });
        const response = await transport.requestReading(request);
        if (record(response)) proofs.set(response, { context: binding, proof: parseProof(header) });
        return response;
      },
    },
    sourceVerifier: {
      async verifyProductionIssue({ sourceResponse, executedRequest, executionAttemptId, sourceBirthRevisionId }) {
        if (!record(sourceResponse) || sourceResponse.state !== 'delivered' || !record(sourceResponse.reading)) {
          return null;
        }
        const entry = proofs.get(sourceResponse);
        proofs.delete(sourceResponse);
        if (!entry || !record(entry.proof)) return null;
        const { context, proof: { payload, signature } } = entry;
        if (!record(payload) || typeof signature !== 'string' || !/^[a-zA-Z0-9_-]{86}$/u.test(signature)) {
          return null;
        }
        const now = Date.now();
        const requestHash = hashJson(executedRequest);
        const responseHash = hashJson(sourceResponse);
        if (
          payload.version !== VERSION || payload.issuer !== issuer || payload.audience !== audience ||
          payload.keyId !== keyId || payload.authorityHash !== authorityHash ||
          executionAttemptId !== context.executionAttemptId || payload.executionAttemptId !== executionAttemptId ||
          sourceBirthRevisionId !== context.sourceBirthRevisionId || payload.releaseRef !== context.releaseRef ||
          payload.requestBodyHash !== requestHash || payload.responseBodyHash !== responseHash ||
          typeof payload.nativeReadingId !== 'string' || payload.nativeReadingId !== sourceResponse.reading.readingId ||
          typeof payload.engineVersion !== 'string' || !TOKEN.test(payload.engineVersion) ||
          typeof payload.issuedAtMs !== 'number' || !Number.isSafeInteger(payload.issuedAtMs) ||
          payload.issuedAtMs < now - MAX_PROOF_AGE_MS || payload.issuedAtMs > now + MAX_FUTURE_SKEW_MS ||
          !verify(null, Buffer.from(SIGNATURE_DOMAIN + hashJson(payload)), verificationKey, Buffer.from(signature, 'base64url'))
        ) return null;
        return {
          state: 'production_source_verified',
          nativeReadingId: payload.nativeReadingId,
          sourceRequestHash: requestHash,
          sourceResponseHash: responseHash,
          sourceBirthRevisionId,
          sourceBirthInputHash: context.sourceBirthInputHash,
          engineVersion: payload.engineVersion,
          externalRequestRef: executionAttemptId,
        };
      },
    },
  };
}
