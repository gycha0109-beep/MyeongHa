import { handleApprovedSajuReaderQuestionHttpV1, APPROVED_SAJU_READER_QUESTION_PATH_V1 } from './approved-saju-reader-question-http-v1.js';
import { handleOfficialReaderPaidChatMessageHttpV1 } from './official-reader-paid-chat-message-http-v1.js';
import { handleOfficialReaderPaidDeliveryAckHttpV1 } from './official-reader-paid-chat-delivery-ack-http-v1.js';
import { READER_INTERPRETATION_PREVIEW_HTTP_PATH_V1 } from './reader-interpretation-preview-http.js';
import { executeReaderInterpretationPreviewPostgresV1 } from './reader-interpretation-preview-postgres-execution.js';
import { readBoundedUpstreamJsonTextV1 } from './upstream-json-response-resource.js';

type SceneRuntime = Parameters<typeof executeReaderInterpretationPreviewPostgresV1>[0];
type QuestionRuntime = NonNullable<Parameters<typeof handleApprovedSajuReaderQuestionHttpV1>[0]['runtime']>;
type DeliveryRuntime = Required<Pick<Parameters<typeof handleOfficialReaderPaidChatMessageHttpV1>[0],
  'keyResolver' | 'privacyLedgerPort' | 'deliveryTokenSecret'>>;

const PAID_REPLY = /^\/api\/chat\/[^/]+\/paid-readings\/[^/]+(?:\/(ack))?$/u;
const HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  Vary: 'Cookie, Authorization',
};

function failure(status: number, code: string) {
  return Response.json({ ok: false, error: { code } }, { status, headers: HEADERS });
}

/** Isolated Reader host composition. Scene retains the existing preview cohort. */
export function createApprovedSajuReaderHttpRuntimeV1(input: Readonly<{
  origin: string;
  question: QuestionRuntime;
  scene: Omit<SceneRuntime, 'verifiedEvidence' | 'body' | 'effectiveAt' | 'pool' |
    'contentReleaseRuntime' | 'privateApprovedSajuReaderEnabled' | 'approvedSajuCanonicalReaderAuthority' |
    'createProductReaderEligibilityAuthorityPort'>;
  delivery: DeliveryRuntime;
}>) {
  const origin = new URL(input.origin);
  const { question, scene, delivery } = input;
  const { identityEvidenceVerifier, pool, protectedPool, issuanceProofPool, productionIssueProofTrusts } = question;
  if (origin.origin !== input.origin ||
      (origin.protocol !== 'https:' && (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1')) ||
      new Set([pool, protectedPool, issuanceProofPool]).size !== 3 ||
      productionIssueProofTrusts.length === 0 ||
      question.consultationPort.evaluateBatch === undefined ||
      delivery.deliveryTokenSecret.byteLength !== 32) {
    throw new Error('Approved Saju Reader HTTP authority is incomplete.');
  }
  const deliveryTokenSecret = new Uint8Array(delivery.deliveryTokenSecret);

  return Object.freeze({
    async handleRequest(context: { request: Request; requestId: string; serverTime: string }): Promise<Response | null> {
      const { request, requestId, serverTime } = context;
      const url = new URL(request.url);
      const isScene = url.pathname === READER_INTERPRETATION_PREVIEW_HTTP_PATH_V1;
      const isQuestion = url.pathname === APPROVED_SAJU_READER_QUESTION_PATH_V1;
      const paid = PAID_REPLY.exec(url.pathname);
      if (!isScene && !isQuestion && !paid) return null;
      if (url.origin !== origin.origin || url.search !== '' || url.hash !== '') return failure(404, 'NOT_FOUND');
      if (isQuestion) return handleApprovedSajuReaderQuestionHttpV1({ request, runtime: question });
      if (paid) {
        const paidInput = { ...context, paidReadReleaseEnabled: true, purchaseKind: 'approved_saju' as const,
          identityEvidenceVerifier, pool: protectedPool };
        return paid[1] === 'ack' ? handleOfficialReaderPaidDeliveryAckHttpV1(paidInput)
          : handleOfficialReaderPaidChatMessageHttpV1({ ...paidInput, ...delivery, deliveryTokenSecret });
      }
      if (request.method !== 'POST') {
        return new Response(null, { status: 405, headers: { ...HEADERS, Allow: 'POST' } });
      }
      if (request.headers.get('Origin') !== origin.origin) return failure(403, 'ACCESS_DENIED');
      if (request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
        return failure(400, 'INVALID_REQUEST');
      }
      let body: unknown;
      try {
        body = JSON.parse(await readBoundedUpstreamJsonTextV1(request, {
          maximumBodyBytes: 1024, signal: AbortSignal.any([request.signal, AbortSignal.timeout(5000)]),
        }));
      } catch {
        return failure(400, 'INVALID_REQUEST');
      }
      try {
        const verifiedEvidence = await identityEvidenceVerifier.verifyRequestIdentity(request);
        if (verifiedEvidence?.kind !== 'member') return failure(401, 'AUTH_REQUIRED');
        const data = await executeReaderInterpretationPreviewPostgresV1({
          ...scene, pool, verifiedEvidence, body, effectiveAt: serverTime,
          contentReleaseRuntime: question.releaseRuntime, privateApprovedSajuReaderEnabled: true,
          createProductReaderEligibilityAuthorityPort: question.createProductReaderEligibilityAuthorityPort,
          approvedSajuCanonicalReaderAuthority: { pool: issuanceProofPool, trusts: productionIssueProofTrusts },
        });
        return Response.json({ ok: true, data, meta: { apiContractVersion: 'v0.9', requestId, serverTime } },
          { headers: HEADERS });
      } catch {
        return failure(404, 'NOT_FOUND');
      }
    },
  });
}
