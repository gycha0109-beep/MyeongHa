import { describe, expect, it, vi } from 'vitest';
import { createApprovedSajuReaderHttpRuntimeV1 } from './approved-saju-reader-http-runtime-v1.js';
import { APPROVED_SAJU_READER_QUESTION_PATH_V1 } from './approved-saju-reader-question-http-v1.js';
import { READER_INTERPRETATION_PREVIEW_HTTP_PATH_V1 } from './reader-interpretation-preview-http.js';
import { executeReaderInterpretationPreviewPostgresV1 } from './reader-interpretation-preview-postgres-execution.js';
import { executePostgresApprovedSajuPaidAnswerTransactionV1 } from './postgres-subject-execution.js';

vi.mock('./reader-interpretation-preview-postgres-execution.js', () => ({
  executeReaderInterpretationPreviewPostgresV1: vi.fn(),
}));
vi.mock('./postgres-subject-execution.js', async importOriginal => ({
  ...await importOriginal<typeof import('./postgres-subject-execution.js')>(),
  executePostgresApprovedSajuPaidAnswerTransactionV1: vi.fn(),
}));

const origin = 'http://127.0.0.1:4173';
const id = '11111111-1111-4111-8111-111111111111';
const evidence = { kind: 'member' as const, verifiedAuthUserId: id };
const time = '2026-11-13T00:00:00.000Z';
const paidPath = '/api/chat/' + id + '/paid-readings/' + id;

function fixture() {
  const connect = vi.fn(() => { throw new Error('Unexpected database access.'); });
  const verifyRequestIdentity = vi.fn(async (request: Request) =>
    request.headers.get('Authorization') === 'Bearer member' ? evidence : null);
  const input = {
    origin,
    question: {
      pool: { connect }, protectedPool: { connect }, issuanceProofPool: { connect },
      productionIssueProofTrusts: [{}], consultationPort: { evaluateBatch: vi.fn() },
      createProductReaderEligibilityAuthorityPort: vi.fn(),
      releaseRuntime: {}, identityEvidenceVerifier: { verifyRequestIdentity },
    },
    scene: { activationEnv: {}, createContextAuthorityPort: vi.fn() },
    delivery: { keys: { issueUniqueKey: vi.fn(), resolveCachedKey: vi.fn() }, privacyLedgerPort: {},
      deliveryTokenSecret: new Uint8Array(32) },
  } as unknown as Parameters<typeof createApprovedSajuReaderHttpRuntimeV1>[0];
  const server = createApprovedSajuReaderHttpRuntimeV1(input);
  return {
    input, connect, verifyRequestIdentity,
    request(path: string, init?: RequestInit) {
      return server.handleRequest({ request: new Request(origin + path, init), requestId: id, serverTime: time });
    },
  };
}

describe('isolated approved Saju Reader HTTP runtime', () => {
  it('keeps unrelated routes out of the private composition and requires separated DB capabilities', async () => {
    const { input, request } = fixture();
    expect(await request('/api/readings')).toBeNull();
    expect(() => createApprovedSajuReaderHttpRuntimeV1({
      ...input, question: { ...input.question, protectedPool: input.question.pool },
    })).toThrow('authority is incomplete');
  });

  it('uses the same signed source and policy for the authenticated Scene and the question flow', async () => {
    const { input, request } = fixture();
    const scene = { mode: 'reader_interpretation', readerCharacterId: 'seyeon' };
    const execute = vi.mocked(executeReaderInterpretationPreviewPostgresV1);
    execute.mockResolvedValueOnce(scene as Awaited<ReturnType<typeof executeReaderInterpretationPreviewPostgresV1>>);
    const query = vi.fn(async () => ({ rows: [{ safeMessageId: id, canContinue: true, sourceUnitRefs: ['internal'] }] }));
    vi.mocked(executePostgresApprovedSajuPaidAnswerTransactionV1).mockImplementationOnce(
      async ({ execute: read }) => read({
        resolvedSubject: { subjectId: id, subjectKind: 'member' }, client: { query },
      } as Parameters<typeof read>[0]),
    );
    const body = { officialReadingId: id, threadId: id };
    const response = await request(READER_INTERPRETATION_PREVIEW_HTTP_PATH_V1, {
      method: 'POST', body: JSON.stringify(body),
      headers: { Origin: origin, 'Content-Type': 'application/json', Authorization: 'Bearer member' },
    });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      body, verifiedEvidence: evidence, effectiveAt: time, privateApprovedSajuReaderEnabled: true,
      createProductReaderEligibilityAuthorityPort: input.question.createProductReaderEligibilityAuthorityPort,
      approvedSajuCanonicalReaderAuthority: {
        pool: input.question.issuanceProofPool, trusts: input.question.productionIssueProofTrusts,
      },
    }));
    expect(query).toHaveBeenCalledWith(expect.stringContaining('qry_approved_saju_reader_latest_marker_v1'),
      [id, id, 'seyeon', id]);
    expect(await response?.json()).toEqual({ ok: true, data: scene,
      meta: { apiContractVersion: 'v0.9', requestId: id, serverTime: time,
        latestPaidReply: { safeMessageId: id, canContinue: true } } });
    expect(response?.headers.get('Cache-Control')).toContain('no-store');
  });

  it('applies the real question, reveal and ACK method and identity checks before database access', async () => {
    const { connect, request, verifyRequestIdentity } = fixture();
    expect((await request(APPROVED_SAJU_READER_QUESTION_PATH_V1))?.status).toBe(405);
    expect((await request(paidPath + '/ack'))?.status).toBe(405);
    expect((await request(paidPath, { method: 'POST' }))?.status).toBe(405);
    expect((await request(paidPath + '?untrusted=1'))?.status).toBe(404);
    expect((await request(READER_INTERPRETATION_PREVIEW_HTTP_PATH_V1, {
      method: 'POST', headers: { Origin: 'https://different.example' },
    }))?.status).toBe(403);
    expect(verifyRequestIdentity).not.toHaveBeenCalled();
    expect((await request(paidPath, { headers: { 'X-Reader-Delivery-Request-Id': id } }))?.status).toBe(401);
    expect(connect).not.toHaveBeenCalled();
  });
});
