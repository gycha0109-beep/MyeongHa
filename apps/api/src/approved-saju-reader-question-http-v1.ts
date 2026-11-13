import { randomUUID } from 'node:crypto';
import type { ContentReleaseRuntime } from '../../../packages/world-content/src/index.js';
import {
  commitApprovedSajuReaderFollowupPostgresV1,
  prepareApprovedSajuReaderFollowupPostgresV1,
} from './approved-saju-reader-followup-postgres-v1.js';
import { prepareChatReceiveCommand } from './chat-receive.js';
import { getChatThreadRuntimeBinding } from './chat-thread-runtime-binding-read.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import type { OfficialReaderProtectedBodyKeyV1 } from './official-reader-protected-body-crypto-v1.js';
import { createPostgresChatThreadRuntimeBindingAuthorityPortV1 } from './postgres-chat-thread-runtime-binding.js';
import {
  executePostgresApprovedSajuPaidAnswerTransactionV1,
  executePostgresSubjectTransactionV1,
} from './postgres-subject-execution.js';
import { readBoundedUpstreamJsonTextV1 } from './upstream-json-response-resource.js';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const HASH = /^sha256:v1:[a-f0-9]{64}$/u;
export const APPROVED_SAJU_READER_QUESTION_PATH_V1 = '/api/me/readings/reader-questions';
const HEADERS = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' };

type QuestionInput = Readonly<{
  readingId: string;
  threadId: string;
  clientTurnId: string;
  text: string;
  firstSceneQuestion?: Readonly<{ interpretationHash: string; segmentIndex: number }>;
}>;

function parseQuestion(value: unknown): QuestionInput | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !['readingId', 'threadId', 'clientTurnId', 'text', 'firstSceneQuestion'].includes(key))) return null;
  const { readingId, threadId, clientTurnId, text, firstSceneQuestion } = body;
  if (typeof readingId !== 'string' || !UUID.test(readingId) ||
      typeof threadId !== 'string' || !UUID.test(threadId) ||
      typeof clientTurnId !== 'string' || !UUID.test(clientTurnId) ||
      typeof text !== 'string' || text.trim() === '' || text.length > 240 ||
      /[\p{Cc}\p{Cf}]/u.test(text)) return null;
  const question = { readingId, threadId, clientTurnId, text: text.trim() };
  if (firstSceneQuestion === undefined) return question;
  if (typeof firstSceneQuestion !== 'object' || firstSceneQuestion === null ||
      Array.isArray(firstSceneQuestion) || Object.keys(firstSceneQuestion).length !== 2 ||
      !('interpretationHash' in firstSceneQuestion) || !('segmentIndex' in firstSceneQuestion)) return null;
  const { interpretationHash, segmentIndex } = firstSceneQuestion;
  return typeof interpretationHash === 'string' && HASH.test(interpretationHash) &&
    typeof segmentIndex === 'number' && Number.isSafeInteger(segmentIndex) && segmentIndex >= 0 && segmentIndex < 64
    ? { ...question, firstSceneQuestion: { interpretationHash, segmentIndex } } : null;
}

type Dependencies = Omit<Parameters<typeof prepareApprovedSajuReaderFollowupPostgresV1>[0],
  'verifiedEvidence' | 'readingId' | 'receivePlan' | 'firstSceneQuestion'> & Readonly<{
    identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
    releaseRuntime: ContentReleaseRuntime;
    clientCapability: string;
    issueUniqueKey: () => Promise<OfficialReaderProtectedBodyKeyV1>;
  }>;

function unavailable(status: number, code: string) {
  return Response.json({ ok: false, error: { code } }, { status, headers: HEADERS });
}

function accepted(threadId: string, safeMessageId: string) {
  return Response.json({ ok: true, data: { threadId, safeMessageId } }, { headers: HEADERS });
}

/** Private launch candidate. The response exposes only the marker used by protected GET/ACK. */
export async function handleApprovedSajuReaderQuestionHttpV1(input: Readonly<{
  request: Request;
  runtime?: Dependencies;
}>): Promise<Response | null> {
  const { request, runtime } = input;
  const url = new URL(request.url);
  if (url.pathname !== APPROVED_SAJU_READER_QUESTION_PATH_V1) return null;
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { ...HEADERS, Allow: 'POST' } });
  }
  if (!runtime) return unavailable(503, 'CAPABILITY_UNAVAILABLE');
  if (request.headers.get('Origin') !== url.origin || url.search !== '') return unavailable(403, 'ACCESS_DENIED');
  if (request.headers.get('Content-Type')?.split(';')[0]?.trim() !== 'application/json') {
    return unavailable(400, 'INVALID_REQUEST');
  }
  let question: QuestionInput | null;
  try {
    question = parseQuestion(JSON.parse(await readBoundedUpstreamJsonTextV1(request, {
      maximumBodyBytes: 4096, signal: AbortSignal.any([request.signal, AbortSignal.timeout(5000)]),
    })));
  } catch {
    return unavailable(400, 'INVALID_REQUEST');
  }
  if (question === null) return unavailable(400, 'INVALID_REQUEST');
  const { readingId, threadId, clientTurnId, text, firstSceneQuestion } = question;
  try {
    const verifiedEvidence = await runtime.identityEvidenceVerifier.verifyRequestIdentity(request);
    if (verifiedEvidence?.kind !== 'member') return unavailable(401, 'AUTH_REQUIRED');
    if (runtime.pool === runtime.protectedPool || runtime.pool === runtime.issuanceProofPool ||
        runtime.protectedPool === runtime.issuanceProofPool || runtime.productionIssueProofTrusts.length === 0 ||
        runtime.consultationPort.evaluateBatch === undefined) return unavailable(503, 'CAPABILITY_UNAVAILABLE');
    const thread = await executePostgresSubjectTransactionV1({
      pool: runtime.pool, verifiedEvidence,
      execute: ({ client, resolvedSubject }) => getChatThreadRuntimeBinding({
        resolvedSubjectId: resolvedSubject.subjectId, threadId,
        authorityPort: createPostgresChatThreadRuntimeBindingAuthorityPortV1(client),
      }),
    });
    const reader = thread.participantCharacterIds[0];
    if (!reader || thread.participantCharacterIds.length !== 1) return unavailable(404, 'NOT_FOUND');
    const receivePlan = prepareChatReceiveCommand({
      request: { threadId, clientTurnId, text, clientCapability: runtime.clientCapability },
      releaseRuntime: runtime.releaseRuntime,
      trustedThread: { threadId, pinnedReleaseId: thread.activeContentReleaseId, participantCharacterIds: [reader] },
    });
    const { releaseId, bundleId } = receivePlan.resolvedContent;
    if (bundleId !== thread.activeContentBundleId) return unavailable(404, 'NOT_FOUND');

    const turnId = randomUUID(), attemptId = randomUUID();
    const reservation = await executePostgresApprovedSajuPaidAnswerTransactionV1({
      pool: runtime.protectedPool, verifiedEvidence,
      execute: async ({ client, resolvedSubject }) => {
        const { rows } = await client.query<{ turnId: string; attemptId: string | null; safeMessageId: string | null; state: string }>(
          'select turn_id::text as "turnId",attempt_id::text as "attemptId",safe_message_id::text as "safeMessageId",state ' +
          'from public.cmd_reserve_approved_saju_reader_question_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)',
          [resolvedSubject.subjectId, readingId, threadId, reader, releaseId, bundleId, clientTurnId,
            receivePlan.requestHash, receivePlan.normalizedRequest.text, JSON.stringify(firstSceneQuestion ?? null),
            turnId, randomUUID(), attemptId],
        );
        if (rows.length !== 1) throw new Error('Protected Reader reservation is unavailable.');
        return rows[0]!;
      },
    });
    if (reservation.state === 'committed' && reservation.safeMessageId && UUID.test(reservation.safeMessageId)) {
      return accepted(threadId, reservation.safeMessageId);
    }
    if (reservation.state === 'in_progress') return unavailable(409, 'QUESTION_IN_PROGRESS');
    if (reservation.state !== 'reserved' || reservation.turnId !== turnId || reservation.attemptId !== attemptId) {
      return unavailable(409, 'QUESTION_UNAVAILABLE');
    }

    let committed = false;
    try {
      const prepared = await prepareApprovedSajuReaderFollowupPostgresV1({
        ...runtime, verifiedEvidence, readingId, receivePlan,
        ...(firstSceneQuestion === undefined ? {} : { firstSceneQuestion }),
      });
      if (prepared === null) return unavailable(409, 'QUESTION_UNAVAILABLE');
      const key = await runtime.issueUniqueKey();
      const result = await commitApprovedSajuReaderFollowupPostgresV1({
        protectedPool: runtime.protectedPool, verifiedEvidence, prepared, key,
        turnId, attemptId, bodyId: randomUUID(), safeMessageId: randomUUID(),
      });
      if (result === null) return unavailable(409, 'QUESTION_UNAVAILABLE');
      committed = true;
      return accepted(threadId, result.safeMessageId);
    } finally {
      if (!committed) {
        await executePostgresApprovedSajuPaidAnswerTransactionV1({
          pool: runtime.protectedPool, verifiedEvidence,
          execute: async ({ client, resolvedSubject }) => {
            await client.query('select public.cmd_fail_approved_saju_reader_question_v1($1,$2,$3)',
              [resolvedSubject.subjectId, turnId, attemptId]);
          },
        });
      }
    }
  } catch {
    return unavailable(404, 'NOT_FOUND');
  }
}
