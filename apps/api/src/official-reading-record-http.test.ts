import { describe, expect, it, vi } from 'vitest';
import { getSajuProductChapterBlueprintV1 } from '../../../packages/domain/src/saju-product-chapter-blueprints-v1.js';
import { MyeongHaApiClientV1, readApprovedSajuPurchaseReadingsV1 } from '../../../packages/api-client/src/index.js';
import { hashSajuHeldSourceProofRequestV1 } from './saju-held-source-proof-verifier-v1.js';
import { handleOfficialReadingRecordRequestV1 } from './official-reading-record-http.js';
import type {
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';

const AUTH_USER_ID = '11111111-1111-4111-8111-111111111111';
const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const READING_ID = '44444444-4444-4444-8444-444444444444';
const SESSION_ID = '55555555-5555-4555-8555-555555555555';
const PURCHASE_ID = '66666666-6666-4666-8666-666666666666';

const SNAPSHOT = Object.freeze({
  responseVersion: 'myeonghwa-product-reading-response-v2',
  responseId: 'reading_response_aaaaaaaaaaaaaaaaaaaaaaaa',
  state: 'delivered',
  messageCode: 'READING_DELIVERED',
  requiredAction: 'none',
  reading: Object.freeze({
    readingId: READING_ID,
    sections: Object.freeze([
      { sectionType: 'overview', state: 'complete', title: '공식 결과',
        blocks: [{ type: 'paragraph', text: '원문 해석' }] },
    ]),
    disclosures: Object.freeze([{ type: 'scope_limitation', text: '검증된 범위 안에서 해석합니다.' }]),
  }),
});
const ROW = Object.freeze({
  readingId: READING_ID,
  readingSessionId: SESSION_ID,
  sajuDomain: 'career',
  readingContractVersion: 'myeonghwa-product-reading-response-v2',
  productResponseState: 'delivered',
  responseSnapshotJsonb: SNAPSHOT,
  responseHash: 'sha256:v1:' + hashSajuHeldSourceProofRequestV1(SNAPSHOT),
  readerCharacterIds: Object.freeze(['seyeon']),
  completedAt: '2026-09-23T00:01:00.000Z',
});

function request(query = `readingId=${READING_ID}`, method = 'GET'): Request {
  return new Request(`https://myeongha.internal/api/readings?${query}`, {
    method,
    headers: { Authorization: 'Bearer member-secret' },
  });
}

function verifier(authenticated = true) {
  return {
    verifyRequestIdentity: vi.fn(async () => authenticated
      ? { kind: 'member' as const, verifiedAuthUserId: AUTH_USER_ID }
      : null),
  };
}

function fakePool(input: {
  readonly rows?: readonly typeof ROW[];
  readonly birthRows?: readonly { issuedRevisionNo: number | null; currentRevisionNo: number | null; revisionState: string }[];
  readonly onAuthorityQuery?: (values: readonly unknown[]) => void;
  readonly onBirthQuery?: (values: readonly unknown[]) => void;
  readonly onRollback?: () => void;
  readonly archiveRows?: readonly object[];
  readonly approvedRows?: readonly object[];
} = {}): PostgresSubjectPoolV1 {
  return {
    async connect(): Promise<PostgresSubjectConnectionV1> {
      return {
        async query<ResultRow = Record<string, unknown>>(
          text: string,
          values?: readonly unknown[],
        ): Promise<{ rows: readonly ResultRow[] }> {
          if (
            text === 'BEGIN'
            || text.startsWith('SET LOCAL ROLE')
            || text === 'COMMIT'
          ) {
            return { rows: [] };
          }
          if (text === 'ROLLBACK') {
            input.onRollback?.();
            return { rows: [] };
          }
          if (text.includes('begin_member_subject_context_v1')) {
            return {
              rows: [{ subjectId: SUBJECT_ID, subjectKind: 'member' } as ResultRow],
            };
          }
          if (text.includes('assert_myeongha_subject_context_v1')) {
            expect(values).toEqual([SUBJECT_ID]);
            return { rows: [] };
          }
          if (text.includes('qry_official_reading_birth_revision_status_v1')) {
            input.onBirthQuery?.(values ?? []);
            return {
              rows: (input.birthRows ?? [{
                issuedRevisionNo: 2, currentRevisionNo: 3, revisionState: 'changed',
              }]) as readonly ResultRow[],
            };
          }
          if (text.includes('qry_official_reading_record_runtime_v1')) {
            input.onAuthorityQuery?.(values ?? []);
            return { rows: (input.rows ?? [ROW]) as readonly ResultRow[] };
          }
          if (text.includes('qry_approved_saju_component_record_v1')) {
            return { rows: (input.approvedRows ?? []) as readonly ResultRow[] };
          }
          if (text.includes('qry_approved_saju_purchase_readings_v1')) {
            expect(values).toEqual([SUBJECT_ID, PURCHASE_ID]);
            return { rows: (input.archiveRows ?? []) as readonly ResultRow[] };
          }
          throw new Error(`Unexpected SQL in Official Reading record HTTP test: ${text}`);
        },
        release: vi.fn(),
      };
    },
  };
}

async function invoke(input: {
  readonly request?: Request;
  readonly authenticated?: boolean;
  readonly pool?: PostgresSubjectPoolV1;
  readonly approvedSajuArchiveEnabled?: true;
  readonly verifiedReadingAnalytics?: { record(request:Request,readingId:string):Promise<'inserted'|'replayed'> };
} = {}): Promise<Response> {
  return handleOfficialReadingRecordRequestV1({
    request: input.request ?? request(),
    requestId: 'req-official-reading-record',
    serverTime: '2026-09-23T00:02:00.000Z',
    identityEvidenceVerifier: verifier(input.authenticated ?? true),
    pool: input.pool ?? fakePool(),
    ...(input.approvedSajuArchiveEnabled === true ? { approvedSajuArchiveEnabled: true } : {}),
    ...(input.verifiedReadingAnalytics===undefined?{}:{verifiedReadingAnalytics:input.verifiedReadingAnalytics}),
  });
}

describe('Official Reading record HTTP adapter', () => {
  it('passes the exact paid order from the client to the opt-in archive and returns safe reopen metadata', async () => {
    const purchaseRequest = request(`purchaseIntentId=${PURCHASE_ID}`);
    expect((await invoke({ request: purchaseRequest })).status).toBe(404);
    expect((await invoke({ request: purchaseRequest, approvedSajuArchiveEnabled: true, authenticated: false })).status).toBe(401);
    expect((await invoke({ request: purchaseRequest, approvedSajuArchiveEnabled: true })).status).toBe(404);
    const pool = fakePool({ archiveRows: [
      { component: 'career', readingId: READING_ID, readingSessionId: SESSION_ID, sajuDomain: 'career',
        readerCharacterId: 'seyeon', completedAt: ROW.completedAt },
      { component: 'wealth', readingId: null, readingSessionId: null, sajuDomain: null, readerCharacterId: null, completedAt: null },
    ] });
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.internal',
      fetchImpl: (url, init) => invoke({ request: new Request(url, init), pool, approvedSajuArchiveEnabled: true }),
    });
    await expect(readApprovedSajuPurchaseReadingsV1(client, 'member-secret', PURCHASE_ID)).resolves.toEqual([
      { component: 'career', state: 'ready', readingId: READING_ID, readingSessionId: SESSION_ID, sajuDomain: 'career',
        readerCharacterId: 'seyeon', completedAt: ROW.completedAt },
      { component: 'wealth', state: 'pending' },
    ]);
  });
  it.each([
    `readingId=${READING_ID}&readingId=${READING_ID}`,
    'readingId=reading-1',
    `readingId=${READING_ID}&threadId=77777777-7777-4777-8777-777777777777`,
  ])('fails closed before auth or PostgreSQL for non-canonical archive query: %s', async (query) => {
    const connect = vi.fn(async () => {
      throw new Error('must not connect');
    });
    const response = await invoke({
      request: request(query),
      pool: { connect },
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('');
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects unsupported methods before identity resolution or PostgreSQL', async () => {
    const connect = vi.fn(async () => {
      throw new Error('must not connect');
    });
    const identityEvidenceVerifier = verifier();
    const response = await handleOfficialReadingRecordRequestV1({
      request: request(`readingId=${READING_ID}`, 'POST'),
      requestId: 'req-official-reading-record-method',
      serverTime: '2026-09-23T00:02:00.000Z',
      identityEvidenceVerifier,
      pool: { connect },
    });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(identityEvidenceVerifier.verifyRequestIdentity).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it('requires verified identity before touching PostgreSQL', async () => {
    const connect = vi.fn(async () => {
      throw new Error('must not connect');
    });
    const response = await invoke({
      authenticated: false,
      pool: { connect },
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload.error.code).toBe('AUTH_REQUIRED');
    expect(connect).not.toHaveBeenCalled();
  });

  it('binds the canonical owner subject and requested Reading identity to archive authority', async () => {
    const onAuthorityQuery = vi.fn((values: readonly unknown[]) => {
      expect(values).toEqual([SUBJECT_ID, READING_ID]);
    });
    const response = await invoke({ pool: fakePool({ onAuthorityQuery }) });
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload.data).toMatchObject({
      readingId: READING_ID,
      readingSessionId: SESSION_ID,
      sajuDomain: 'career',
      productResponseState: 'delivered',
      readerCharacterIds: ['seyeon'],
    });
    expect(payload.data).not.toHaveProperty('responseHash');
    expect(payload.data).not.toHaveProperty('threadId');
    expect(payload.data.birthRevision).toEqual({
      issuedRevisionNo: 2, currentRevisionNo: 3, state: 'changed',
    });
    expect(onAuthorityQuery).toHaveBeenCalledTimes(1);
  });

  it('opt-in completion backfill is attempted only after a successful authorized archive read',async()=>{
    const record=vi.fn(async (_request:Request,_readingId:string):Promise<'inserted'>=>'inserted');
    const response=await invoke({verifiedReadingAnalytics:{record}});
    expect(response.status).toBe(200);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(expect.any(Request),READING_ID);
    const unauthorized=await invoke({authenticated:false,verifiedReadingAnalytics:{record}});
    expect(unauthorized.status).toBe(401);
    expect(record).toHaveBeenCalledTimes(1);
    const invalid=await invoke({request:request('readingId=invalid'),verifiedReadingAnalytics:{record}});
    expect(invalid.status).toBe(404);
    expect(record).toHaveBeenCalledTimes(1);
    const missing=await invoke({pool:fakePool({rows:[]}),verifiedReadingAnalytics:{record}});
    expect(missing.status).toBe(404);
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('does not turn an already successful official archive read into a failure when optional analytics is disabled or rejects',async()=>{
    const record=vi.fn(async (_request:Request,_readingId:string):Promise<'inserted'>=>{
      throw Error('Consent not granted / analytics unavailable');
    });
    const result=await invoke({verifiedReadingAnalytics:{record}});
    expect(result.status).toBe(200);
    expect((await result.json() as {ok:boolean}).ok).toBe(true);
    expect(record).toHaveBeenCalledTimes(1);
    const inactive=await invoke();
    expect(inactive.status).toBe(200);
  });

  it('rejects a malformed v2 stored hash and rolls back before disclosing an HTTP record', async () => {
    const onRollback = vi.fn();
    await expect(invoke({
      pool: fakePool({
        rows: [{ ...ROW, responseHash: 'sha256:v1:bad' }],
        onRollback,
      }),
    })).rejects.toThrow('source response hash mismatch');
    expect(onRollback).toHaveBeenCalledTimes(1);
  });

  it('binds a second exact authorized Birth revision query in the same subject transaction', async () => {
    const onBirthQuery = vi.fn((values: readonly unknown[]) => {
      expect(values).toEqual([SUBJECT_ID, READING_ID]);
    });
    const response = await invoke({
      pool: fakePool({ onBirthQuery, birthRows: [{
        issuedRevisionNo: 4, currentRevisionNo: 4, revisionState: 'current',
      }] }),
    });
    const payload = await response.json() as any;
    expect(payload.data.birthRevision).toEqual({
      issuedRevisionNo: 4, currentRevisionNo: 4, state: 'current',
    });
    expect(onBirthQuery).toHaveBeenCalledTimes(1);
  });

  it('rolls back when the exact report loses birth provenance read authority', async () => {
    const onRollback = vi.fn();
    await expect(invoke({
      pool: fakePool({ birthRows: [], onRollback }),
    })).rejects.toThrow('Birth provenance authority did not admit');
    expect(onRollback).toHaveBeenCalledTimes(1);
  });

  it('fails closed and rolls back when owner-scoped archive authority returns duplicate rows', async () => {
    const onRollback = vi.fn();

    await expect(invoke({
      pool: fakePool({ rows: [ROW, ROW], onRollback }),
    })).rejects.toThrow('duplicate rows');

    expect(onRollback).toHaveBeenCalledTimes(1);
  });
});


describe('Official Reading separate Wealth Luna route', () => {
  it('returns a validated extra narration only from a signed, owned Taegyeom Wealth report', async () => {
    const original = {
      ...SNAPSHOT,
      reading: {
        ...SNAPSHOT.reading,
        sections: [
          { sectionType: 'wealth', state: 'complete', title: '돈을 쓰는 기준',
            blocks: [{ type: 'paragraph', text: '내가 원하는 선택과 현실적인 비용 사이에서 어떤 기준을 지킬지 구분하는 장면이 재물 해석의 중심에 있습니다.' }] },
          { sectionType: 'wealth', state: 'complete', title: '자원을 관리하는 구조',
            blocks: [{ type: 'paragraph', text: '돈을 한 덩어리로만 다루지 않고 지켜야 할 비용과 남길 자원을 구분하는 판단이 재물의 관리 관점으로 읽힙니다.' }] },
        ],
      },
    };
    const row = {
      ...ROW,
      approvedComponent: 'wealth',
      sajuDomain: 'wealth',
      readerCharacterIds: Object.freeze(['taegyeom']),
      responseSnapshotJsonb: original,
      responseHash: 'sha256:v1:' + hashSajuHeldSourceProofRequestV1(original),
    };
    const approvedRow = {
      ...row,
      component: 'wealth',
      productId: '77777777-7777-4777-8777-777777777777',
      readerCharacterId: 'taegyeom',
      readerContentBundleId: '88888888-8888-4888-8888-888888888888',
      sourceBirthRevisionId: '99999999-9999-4999-8999-999999999999',
      domainCapabilityVersion: 'v1',
      sajuEngineVersion: 'v1',
      issuedRevisionNo: 1,
      currentRevisionNo: 1,
    };
    let calls = 0;
    const response = await handleOfficialReadingRecordRequestV1({
      request: new Request('https://myeongha.internal/api/readings?readingId=' + READING_ID, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer member-secret',
          Origin: 'https://myeongha.internal',
          'Content-Type': 'application/json',
        },
        body: '{}',
      }),
      requestId: 'req-wealth-luna',
      serverTime: '2026-11-19T00:00:00.000Z',
      identityEvidenceVerifier: verifier(),
      pool: fakePool({ approvedRows: [approvedRow] }),
      approvedSajuArchiveEnabled: true,
      officialWealthLunaProductSource: {
        async getSixChapterSourceFromApprovedPlan(record) {
          const blueprints = getSajuProductChapterBlueprintV1('wealth');
          return {
            version: 'myeongha-official-wealth-luna-reader-v1',
            readingId: record.readingId,
            readerCharacterId: 'taegyeom',
            sourceHash: 'f'.repeat(64),
            chapters: blueprints.map((chapter, index) => ({
              index, title: chapter.fixedTitle,
              excerpts: ['승인 의미 [test-' + index + ']\\n근거 블록: sections.' +
                index + '.blocks.0\\n이 명식의 실제 승인된 해석은 사람마다 적용되는 구조와 조건이 다르다는 점을 전제합니다.'],
            })),
            limitations: [],
            voice: {
              register: '단호한 존댓말',
              sentenceRhythm: '원칙 결과 행동',
              interpretationStyle: '근거와 조건을 구별',
              prohibited: [],
            },
          };
        },
      },
      officialWealthLunaWriter: {
        model: 'gpt-6-luna',
        async readOrCreateValidated({source,validateDraft}) {
          calls++;
          expect(source.chapters).toHaveLength(6);
          const chapters = source.chapters.map(chapter => {
            const sourceAnchor = '이 명식의 실제 승인된 해석은 사람마다 적용되는 구조와 조건이 다르다는 점을 전제합니다.';
            const paragraphs = [1,2,3].map(part =>
              sourceAnchor + ' 이 장의 고유한 질문은 ' + chapter.title +
              ' 입니다. '+ part + '번째 장면에서는 해당 근거를 다른 해석으로 넓히기보다 그 안에서 어떤 조건과 대가가 구별되는지 확인합니다. 공식 원문에 없는 실제 소득이나 미래 자산을 알아맞힌다고 주장하지 않으며, 이 장의 해석을 앞뒤 장과 혼동하지 않고 이해할 필요가 있습니다.');
            return {index:chapter.index,title:chapter.title,sourceAnchor,paragraphs};
          });
          return validateDraft({chapters});
        },
      },
    });
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok:boolean;
      data:{originalReadingUnchanged:boolean;chapters:unknown[]};
    };
    expect(payload.ok).toBe(true);
    expect(payload.data.originalReadingUnchanged).toBe(true);
    expect(payload.data.chapters).toHaveLength(6);
    expect(calls).toBe(1);
  });
});
