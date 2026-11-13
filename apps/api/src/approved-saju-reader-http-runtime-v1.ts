import { handleApprovedSajuReaderQuestionHttpV1, APPROVED_SAJU_READER_QUESTION_PATH_V1 } from './approved-saju-reader-question-http-v1.js';
import { handleOfficialReaderPaidChatMessageHttpV1 } from './official-reader-paid-chat-message-http-v1.js';
import { handleOfficialReaderPaidDeliveryAckHttpV1 } from './official-reader-paid-chat-delivery-ack-http-v1.js';
import { executePostgresApprovedSajuPaidAnswerTransactionV1 } from './postgres-subject-execution.js';
import type { OfficialReaderOffPrimaryKeyStoreV1 } from './official-reader-node-offprimary-privacy-store-v1.js';
import {
  parseReaderInterpretationPreviewHttpRequestV1, READER_INTERPRETATION_PREVIEW_HTTP_PATH_V1,
} from './reader-interpretation-preview-http.js';
import { executeReaderInterpretationPreviewPostgresV1 } from './reader-interpretation-preview-postgres-execution.js';
import { readBoundedUpstreamJsonTextV1 } from './upstream-json-response-resource.js';

type SceneRuntime = Parameters<typeof executeReaderInterpretationPreviewPostgresV1>[0];
type QuestionRuntime = NonNullable<Parameters<typeof handleApprovedSajuReaderQuestionHttpV1>[0]['runtime']>;
type DeliveryRuntime = Required<Pick<Parameters<typeof handleOfficialReaderPaidChatMessageHttpV1>[0],
  'privacyLedgerPort' | 'deliveryTokenSecret'>> & Readonly<{
    keys: Pick<OfficialReaderOffPrimaryKeyStoreV1, 'issueUniqueKey' | 'resolveCachedKey'>;
  }>;

const PAID_REPLY = /^\/api\/chat\/[^/]+\/paid-readings\/[^/]+(?:\/(ack))?$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
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
  question: Omit<QuestionRuntime, 'issueUniqueKey'>;
  scene: Omit<SceneRuntime, 'verifiedEvidence' | 'body' | 'effectiveAt' | 'pool' |
    'contentReleaseRuntime' | 'privateApprovedSajuReaderEnabled' | 'approvedSajuCanonicalReaderAuthority' |
    'createProductReaderEligibilityAuthorityPort'>;
  delivery: DeliveryRuntime;
}>) {
  const origin = new URL(input.origin);
  const { question, scene, delivery } = input;
  const { keys, privacyLedgerPort } = delivery;
  const { identityEvidenceVerifier, pool, protectedPool, issuanceProofPool, productionIssueProofTrusts } = question;
  if (origin.origin !== input.origin ||
      (origin.protocol !== 'https:' && (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1')) ||
      new Set([pool, protectedPool, issuanceProofPool]).size !== 3 ||
      productionIssueProofTrusts.length === 0 ||
      typeof question.createConsultationPort !== 'function' ||
      typeof keys?.issueUniqueKey !== 'function' || typeof keys.resolveCachedKey !== 'function' ||
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
      if (isQuestion) return handleApprovedSajuReaderQuestionHttpV1({
        request, runtime: { ...question, issueUniqueKey: () => keys.issueUniqueKey() },
      });
      if (paid) {
        const paidInput = { ...context, paidReadReleaseEnabled: true, purchaseKind: 'approved_saju' as const,
          identityEvidenceVerifier, pool: protectedPool };
        return paid[1] === 'ack' ? handleOfficialReaderPaidDeliveryAckHttpV1(paidInput)
          : handleOfficialReaderPaidChatMessageHttpV1({
            ...paidInput, keyResolver: keys, privacyLedgerPort, deliveryTokenSecret,
          });
      }
      if (request.method !== 'POST') {
        return new Response(null, { status: 405, headers: { ...HEADERS, Allow: 'POST' } });
      }
      if (request.headers.get('Origin') !== origin.origin) return failure(403, 'ACCESS_DENIED');
      if (request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
        return failure(400, 'INVALID_REQUEST');
      }
      let body: ReturnType<typeof parseReaderInterpretationPreviewHttpRequestV1>;
      try {
        body = parseReaderInterpretationPreviewHttpRequestV1(JSON.parse(await readBoundedUpstreamJsonTextV1(request, {
          maximumBodyBytes: 1024, signal: AbortSignal.any([request.signal, AbortSignal.timeout(5000)]),
        })));
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
        const latestPaidReply = data.mode === 'reader_interpretation'
          ? await executePostgresApprovedSajuPaidAnswerTransactionV1({
            pool: protectedPool, verifiedEvidence,
            execute: async ({ client, resolvedSubject }) => {
              const { rows } = await client.query<{ safeMessageId: string; canContinue: boolean }>(
                'select safe_message_id::text as "safeMessageId",can_continue as "canContinue" ' +
                'from public.qry_approved_saju_reader_latest_marker_v1($1,$2,$3,$4)',
                [resolvedSubject.subjectId, body.threadId, data.readerCharacterId, body.officialReadingId],
              );
              const row = rows[0];
              if (rows.length > 1 || (row !== undefined &&
                  (!UUID.test(row.safeMessageId) || typeof row.canContinue !== 'boolean'))) {
                throw new Error('Latest purchased Reader marker is inconsistent.');
              }
              return row === undefined ? null : { safeMessageId: row.safeMessageId, canContinue: row.canContinue };
            },
          }) : null;
        return Response.json({ ok: true, data,
          meta: { apiContractVersion: 'v0.9', requestId, serverTime, latestPaidReply } }, { headers: HEADERS });
      } catch {
        return failure(404, 'NOT_FOUND');
      }
    },
  });
}
