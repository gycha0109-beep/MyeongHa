import { describe, expect, it, vi } from 'vitest';
import type { BirthProfileReadResponseV1 } from '../apps/api/src/birth-profile-read.js';
import { executeAndPersistCurrentBirthSajuOfficialReadingV1, type SajuOfficialIssuedDbTransactionPortV1 } from '../apps/api/src/saju-production-reading-execution.js';
import { hashSajuHeldSourceProofRequestV1 } from '../apps/api/src/saju-held-source-proof-verifier-v1.js';
import {
  persistIssuedSajuOfficialReadingV1,
  type SajuOfficialImmutableCommitPortV1,
  type SajuOfficialSourceVerificationPortV1,
  type SajuOfficialDbMappingVerificationPortV1,
  type SajuOfficialCurrentAuthorityPortV1,
} from '../apps/api/src/saju-official-reading-issuer-db-persistence-v1.js';
import {
  createPostgresSajuOfficialImmutableCommitPortV1,
  SAJU_OFFICIAL_DB_FINALIZE_AUTHORITY_V1,
} from '../apps/api/src/postgres-saju-official-immutable-commit-v1.js';
import type {
  PostgresTransactionQueryV1, PostgresQueryResultV1,
  PostgresSubjectConnectionV1, PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';
import { createPostgresSajuOfficialIssuedDbTransactionPortV1 } from '../apps/api/src/postgres-saju-official-issued-db-transaction-v1.js';

const subjectId = '11111111-1111-4111-8111-111111111111';
const readingId = '22222222-2222-4222-8222-222222222222';
const readingSessionId = '33333333-3333-4333-8333-333333333333';
const executionAttemptId = '44444444-4444-4444-8444-444444444444';
const outboxEventId = '55555555-5555-4555-8555-555555555555';
const sourceBirthRevisionId = '66666666-6666-4666-8666-666666666666';
const nativeReadingId = 'official_reading_native_v1';

const native = Object.freeze({
  responseId: 'reading_response_' + 'a'.repeat(24),
  responseVersion: 'myeonghwa-product-reading-response-v2',
  state: 'delivered',
  messageCode: 'READING_DELIVERED',
  requiredAction: 'none',
  reading: Object.freeze({
    readingId: nativeReadingId,
    sections: [
      { sectionType: 'personality', state: 'complete', title: '원국',
        blocks: [{ type: 'paragraph', text: '승인된 원문만 보존합니다.' }] },
    ],
    disclosures: [{ type: 'scope_limitation', text: '확인 가능한 범위만 제공합니다.' }],
  }),
});
const sourceHash = hashSajuHeldSourceProofRequestV1(native);
const dbSnapshot = {
  ...native,
  reading: { ...native.reading, readingId },
};
const dbHash = hashSajuHeldSourceProofRequestV1(dbSnapshot);
const storedHash = 'sha256:v1:' + dbHash;
const executedRequest = {
  birth: { calendarType: 'solar' as const, date: '2001-07-14', time: '15:20', sex: 'female' as const },
  reading: { text: '전체 사주' },
};

function ports() {
  const sourceVerifier = {
    verifyProductionIssue: vi.fn(async (_input: Parameters<SajuOfficialSourceVerificationPortV1['verifyProductionIssue']>[0]) => ({
      state: 'production_source_verified' as const,
      nativeReadingId,
      sourceResponseHash: sourceHash,
      sourceBirthRevisionId,
      sourceBirthInputHash: 'sha256:v1:' + 'b'.repeat(64),
      engineVersion: 'saju-engine-v1',
      externalRequestRef: 'internal-only-ref',
    })),
  } satisfies SajuOfficialSourceVerificationPortV1;
  const mappingVerifier = {
    verifyIssuedReadingMapping: vi.fn(async (_input: Parameters<SajuOfficialDbMappingVerificationPortV1['verifyIssuedReadingMapping']>[0]) => ({
      state: 'approved_mapping' as const,
      subjectId, dbReadingId: readingId, readingSessionId,
      sourceBirthRevisionId, nativeReadingId,
      originalResponseHash: sourceHash, storedResponseHash: dbHash,
    })),
  } satisfies SajuOfficialDbMappingVerificationPortV1;
  const currentAuthority = {
    admitCurrentIssue: vi.fn(async (_input: Parameters<SajuOfficialCurrentAuthorityPortV1['admitCurrentIssue']>[0]) => true),
  } satisfies SajuOfficialCurrentAuthorityPortV1;
  const commitPort = {
    finalizeSuccess: vi.fn(async (_input: Parameters<SajuOfficialImmutableCommitPortV1['finalizeSuccess']>[0]) => ({
      readingId, executionAttemptId, responseHash: storedHash, replayed: false,
    })),
  } satisfies SajuOfficialImmutableCommitPortV1;
  return { sourceVerifier, mappingVerifier, currentAuthority, commitPort };
}
function input(port: ReturnType<typeof ports>, response: unknown = native) {
  return {
    subjectId, readingId, readingSessionId, executionAttemptId, outboxEventId,
    sourceBirthRevisionId, sourceResponse: response, executedRequest,
    ...port,
  };
}

function profileFixture(revisionId = sourceBirthRevisionId): BirthProfileReadResponseV1 {
  return {
    birthProfileId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    profileKind: 'self', label: null, archivedAt: null,
    currentRevision: {
      revisionId, revisionNo: 3,
      input: {
        calendarType: 'solar', birthDate: '2001-07-14',
        birthTime: '15:20:00', timeKnown: true,
        isLeapMonth: false, sex: 'female',
      },
    },
    revisions: [{ revisionId, revisionNo: 3, isCurrent: true }],
  };
}

class FakeIssuedDbConnection implements PostgresSubjectConnectionV1 {
  calls: string[] = [];
  released = false;
  resolvedSubjectId = subjectId;
  storedNativeId = nativeReadingId;
  async query<Row = Record<string, unknown>>(
    sql: string, _params: readonly unknown[] = [],
  ): Promise<PostgresQueryResultV1<Row>> {
    this.calls.push(sql);
    let rows: readonly Record<string, unknown>[] = [];
    if (sql.includes('public.begin_member_subject_context_v1')) {
      rows = [{ subjectId: this.resolvedSubjectId, subjectKind: 'member' }];
    } else if (sql.includes('from public.cmd_finalize_reading_transport_success_v1(')) {
      rows = [{ readingId, executionAttemptId, responseHash: storedHash, replayed: false }];
    } else if (sql.includes('from public.reading_refs rr')) {
      rows = [{
        nativeReadingId: this.storedNativeId,
        externalRequestRef: 'internal-only-ref',
        sourceBirthInputHash: 'sha256:v1:' + 'b'.repeat(64),
        readingContractVersion: 'myeonghwa-product-reading-response-v2',
        productResponseState: 'delivered',
        storedSnapshot: dbSnapshot,
        storedResponseHash: storedHash,
      }];
    }
    return { rows: rows as readonly Row[] };
  }
  release(): void { this.released = true; }
}

describe('Saju issued official Reading -> DB immutable commit boundary', () => {
  it('executes Saju fetch before one canonical Subject DB transaction and verifies stored provenance before COMMIT', async () => {
    const p = ports();
    const connection = new FakeIssuedDbConnection();
    const pool = { connect: () => connection } satisfies PostgresSubjectPoolV1;
    const transaction = createPostgresSajuOfficialIssuedDbTransactionPortV1({
      pool,
      verifiedEvidence: { kind: 'member', verifiedAuthUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      currentAuthorityFactory: (_client) => p.currentAuthority,
    });
    const requestReading = vi.fn(async () => native);
    const result = await executeAndPersistCurrentBirthSajuOfficialReadingV1({
      profile: profileFixture(), readingText: '전체 사주',
      adapter: { requestReading },
      subjectId, readingId, readingSessionId,
      executionAttemptId, outboxEventId, sourceBirthRevisionId,
      sourceVerifier: p.sourceVerifier,
      mappingVerifier: p.mappingVerifier,
      dbTransaction: transaction,
    });
    expect(result).toMatchObject({ state: 'committed', readingId });
    expect(connection.calls[0]).toBe('BEGIN');
    expect(connection.calls[1]).toBe('SET LOCAL ROLE myeongha_api_executor');
    expect(connection.calls).toContain('select public.assert_myeongha_subject_context_v1($1::uuid)');
    const commitIndex = connection.calls.findIndex(x => x.includes('cmd_finalize_reading_transport_success_v1'));
    const readIndex = connection.calls.findIndex(x => x.includes('from public.reading_refs rr'));
    expect(commitIndex).toBeGreaterThan(0);
    expect(readIndex).toBeGreaterThan(commitIndex);
    expect(connection.calls.at(-1)).toBe('COMMIT');
    expect(connection.released).toBe(true);
    expect(requestReading).toHaveBeenCalledTimes(1);
  });

  it('denies cross-Subject DB transaction before any immutable artifact commit', async () => {
    const p = ports();
    const connection = new FakeIssuedDbConnection();
    connection.resolvedSubjectId = '88888888-8888-4888-8888-888888888888';
    const transaction = createPostgresSajuOfficialIssuedDbTransactionPortV1({
      pool: { connect: () => connection },
      verifiedEvidence: { kind: 'member', verifiedAuthUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      currentAuthorityFactory: () => p.currentAuthority,
    });
    const result = await transaction.run({
      subjectId,
      commit: async () => {
        throw new Error('Cross-Subject commit must never be called');
      },
    });
    expect(result).toMatchObject({ state: 'held', reason: 'current_authority_unavailable' });
    expect(connection.calls.some(x => x.includes('cmd_finalize_reading_transport_success_v1'))).toBe(false);
    expect(connection.calls.at(-1)).toBe('COMMIT');
  });

  it('rolls back the official write when post-commit native source verification fails', async () => {
    const p = ports();
    const connection = new FakeIssuedDbConnection();
    connection.storedNativeId = 'wrong-native-id';
    const transaction = createPostgresSajuOfficialIssuedDbTransactionPortV1({
      pool: { connect: () => connection },
      verifiedEvidence: { kind: 'member', verifiedAuthUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      currentAuthorityFactory: () => p.currentAuthority,
    });
    await expect(executeAndPersistCurrentBirthSajuOfficialReadingV1({
      profile: profileFixture(), readingText: '전체 사주',
      adapter: { requestReading: async () => native },
      subjectId, readingId, readingSessionId,
      executionAttemptId, outboxEventId, sourceBirthRevisionId,
      sourceVerifier: p.sourceVerifier, mappingVerifier: p.mappingVerifier,
      dbTransaction: transaction,
    })).rejects.toThrow(/stored lineage/);
    expect(connection.calls.at(-1)).toBe('ROLLBACK');
    expect(connection.calls).not.toContain('COMMIT');
    expect(connection.released).toBe(true);
  });


  it('does not call the Saju network when Production issuer or DB transaction is not wired', async () => {
    const requestReading = vi.fn(async () => native);
    const output = await executeAndPersistCurrentBirthSajuOfficialReadingV1({
      profile: profileFixture(), readingText: '전체 사주',
      adapter: { requestReading }, subjectId, readingId, readingSessionId,
      executionAttemptId, outboxEventId, sourceBirthRevisionId,
    });
    expect(output).toMatchObject({ state: 'held', canDisclose: false, canSell: false });
    expect(requestReading).not.toHaveBeenCalled();
  });

  it('never contacts Saju when a configured issuer or DB dependency lacks its required method', async () => {
    for (const brokenPort of ['sourceVerifier', 'mappingVerifier', 'dbTransaction'] as const) {
      const p = ports();
      const requestReading = vi.fn(async () => native);
      const dbTransaction = {
        run: vi.fn(async (args: Parameters<SajuOfficialIssuedDbTransactionPortV1['run']>[0]) =>
          args.commit({ currentAuthority: p.currentAuthority, commitPort: p.commitPort })),
      };
      const supplied = {
        profile: profileFixture(), readingText: '전체 사주',
        adapter: { requestReading }, subjectId, readingId, readingSessionId,
        executionAttemptId, outboxEventId, sourceBirthRevisionId,
        sourceVerifier: p.sourceVerifier, mappingVerifier: p.mappingVerifier,
        dbTransaction,
      };
      const result = await executeAndPersistCurrentBirthSajuOfficialReadingV1({
        ...supplied,
        [brokenPort]: {} as never,
      });
      expect(result).toMatchObject({ state: 'held', canDisclose: false, canSell: false });
      expect(requestReading).not.toHaveBeenCalled();
      expect(dbTransaction.run).not.toHaveBeenCalled();
    }
  });

  it('denies malformed prepared identities before the Saju network or DB transaction', async () => {
    for (const badId of ['subjectId', 'readingId', 'readingSessionId',
      'executionAttemptId', 'outboxEventId', 'sourceBirthRevisionId'] as const) {
      const p = ports();
      const requestReading = vi.fn(async () => native);
      const dbTransaction = {
        run: vi.fn(async (args: Parameters<SajuOfficialIssuedDbTransactionPortV1['run']>[0]) =>
          args.commit({ currentAuthority: p.currentAuthority, commitPort: p.commitPort })),
      };
      const invalid = {
        profile: profileFixture(), readingText: '전체 사주',
        adapter: { requestReading }, subjectId, readingId, readingSessionId,
        executionAttemptId, outboxEventId, sourceBirthRevisionId,
        sourceVerifier: p.sourceVerifier, mappingVerifier: p.mappingVerifier,
        dbTransaction, [badId]: 'not-a-prepared-uuid',
      };
      const result = await executeAndPersistCurrentBirthSajuOfficialReadingV1(invalid);
      expect(result).toMatchObject({
        state: 'held', canDisclose: false, canSell: false,
      });
      expect(requestReading).not.toHaveBeenCalled();
      expect(dbTransaction.run).not.toHaveBeenCalled();
      expect(p.sourceVerifier.verifyProductionIssue).not.toHaveBeenCalled();
    }
  });

  it('requires the DB-pinned current Birth revision before the Saju network or DB transaction', async () => {
    const p = ports();
    const requestReading = vi.fn(async () => native);
    const dbTransaction = {
      run: vi.fn(async (args: Parameters<SajuOfficialIssuedDbTransactionPortV1['run']>[0]) =>
        args.commit({ currentAuthority: p.currentAuthority, commitPort: p.commitPort })),
    };
    const output = await executeAndPersistCurrentBirthSajuOfficialReadingV1({
      profile: profileFixture('77777777-7777-4777-8777-777777777777'),
      readingText: '전체 사주', adapter: { requestReading },
      subjectId, readingId, readingSessionId, executionAttemptId,
      outboxEventId, sourceBirthRevisionId,
      sourceVerifier: p.sourceVerifier, mappingVerifier: p.mappingVerifier,
      dbTransaction,
    });
    expect(output).toMatchObject({ state: 'held', reason: 'current_authority_unavailable' });
    expect(requestReading).not.toHaveBeenCalled();
    expect(dbTransaction.run).not.toHaveBeenCalled();
  });

  it('runs authenticated Saju transport before the governed DB transaction and immutable commit', async () => {
    const p = ports();
    const sequence: string[] = [];
    const requestReading = vi.fn(async (_request: unknown) => {
      sequence.push('saju');
      return native;
    });
    const dbTransaction = {
      run: vi.fn(async (args: Parameters<SajuOfficialIssuedDbTransactionPortV1['run']>[0]) => {
        sequence.push('db');
        expect(args.subjectId).toBe(subjectId);
        return args.commit({ currentAuthority: p.currentAuthority, commitPort: p.commitPort });
      }),
    };
    const result = await executeAndPersistCurrentBirthSajuOfficialReadingV1({
      profile: profileFixture(),
      readingText: '전체 사주',
      adapter: { requestReading },
      subjectId, readingId, readingSessionId,
      executionAttemptId, outboxEventId, sourceBirthRevisionId,
      sourceVerifier: p.sourceVerifier,
      mappingVerifier: p.mappingVerifier,
      dbTransaction,
    });
    expect(result).toMatchObject({ state: 'committed', readingId });
    expect(sequence).toEqual(['saju', 'db']);
    expect(requestReading).toHaveBeenCalledWith({
      birth: { calendarType: 'solar', date: '2001-07-14', time: '15:20', sex: 'female' },
      reading: { text: '전체 사주' },
    });
    expect(p.commitPort.finalizeSuccess).toHaveBeenCalledTimes(1);
  });

  it('does not invoke any issuer, mapping, rights or DB writes when the approved ports are not installed', async () => {
    await expect(persistIssuedSajuOfficialReadingV1({
      subjectId, readingId, readingSessionId, executionAttemptId, outboxEventId,
      sourceBirthRevisionId, sourceResponse: native, executedRequest,
    })).resolves.toEqual({
      contractVersion: 'saju-official-db-issuance-handoff-v1',
      state: 'held', reason: 'production_source_unverified',
      canDisclose: false, canSell: false,
    });
  });

  it('commits only when Production source, exact ID mapping and current DB authority independently approve', async () => {
    const p = ports();
    const result = await persistIssuedSajuOfficialReadingV1(input(p));
    expect(result).toEqual({
      contractVersion: 'saju-official-db-issuance-handoff-v1',
      state: 'committed', readingId, responseHash: storedHash,
      replayed: false, canDisclose: false, canSell: false,
    });
    expect(p.sourceVerifier.verifyProductionIssue).toHaveBeenCalledTimes(1);
    expect(p.sourceVerifier.verifyProductionIssue).toHaveBeenCalledWith(expect.objectContaining({ executedRequest }));
    expect(p.mappingVerifier.verifyIssuedReadingMapping).toHaveBeenCalledTimes(1);
    expect(p.currentAuthority.admitCurrentIssue).toHaveBeenCalledTimes(1);
    expect(p.commitPort.finalizeSuccess).toHaveBeenCalledTimes(1);
    const args = p.commitPort.finalizeSuccess.mock.calls[0]?.[0];
    expect(args?.storedSnapshot).toEqual(dbSnapshot);
    expect(args?.nativeReadingId).toBe(nativeReadingId);
    expect(args?.storedResponseHash).toBe(storedHash);
    expect(args?.sourceResponseHash).toBe(sourceHash);
    expect(args?.sourceBirthInputHash).toBe('sha256:v1:' + 'b'.repeat(64));
    // Never mutate the source-issued response or lose disclosures.
    expect(native.reading.readingId).toBe(nativeReadingId);
    expect(hashSajuHeldSourceProofRequestV1(native)).toBe(sourceHash);
    expect(args?.storedSnapshot.reading).toEqual(dbSnapshot.reading);
  });

  it('fails closed for missing Production verification and never asks DB mapping to authorize a Preview', async () => {
    const p = ports();
    p.sourceVerifier.verifyProductionIssue.mockResolvedValueOnce(null as never);
    const result = await persistIssuedSajuOfficialReadingV1(input(p));
    expect(result).toMatchObject({ state: 'held', reason: 'production_source_unverified' });
    expect(p.mappingVerifier.verifyIssuedReadingMapping).not.toHaveBeenCalled();
    expect(p.currentAuthority.admitCurrentIssue).not.toHaveBeenCalled();
    expect(p.commitPort.finalizeSuccess).not.toHaveBeenCalled();
  });

  it('rejects forged response hashes, a different birth revision and malformed delivered responses before storage', async () => {
    for (const wrong of [
      { sourceResponseHash: 'a'.repeat(64) },
      { sourceBirthRevisionId: '77777777-7777-4777-8777-777777777777' },
      { nativeReadingId: 'other_native_reading' },
    ]) {
      const p = ports();
      const original = await p.sourceVerifier.verifyProductionIssue({
        sourceResponse: native, executedRequest, subjectId, dbReadingId: readingId,
        readingSessionId, sourceBirthRevisionId,
      });
      p.sourceVerifier.verifyProductionIssue.mockResolvedValueOnce({ ...original, ...wrong });
      const result = await persistIssuedSajuOfficialReadingV1(input(p));
      expect(result.state).toBe('held');
      expect(p.commitPort.finalizeSuccess).not.toHaveBeenCalled();
    }
    const p = ports();
    const badResponse = { ...native, reading: { ...native.reading, sections: [{ sectionType: 'custom', state: 'complete', title: '불명확한 출처', blocks: [{ type: 'invented_claim', text: '무근거' }] }] } };
    const denied = await persistIssuedSajuOfficialReadingV1(input(p, badResponse));
    expect(denied.state).toBe('held');
    expect(p.sourceVerifier.verifyProductionIssue).not.toHaveBeenCalled();
  });

  it('rejects an invalid Production issuer Birth input digest before mapping or commit', async () => {
    for (const badHash of ['not-a-hash', 'b'.repeat(64), 'sha256:v1:' + 'g'.repeat(64)]) {
      const p = ports();
      const verified = await p.sourceVerifier.verifyProductionIssue({
        sourceResponse: native, executedRequest, subjectId, dbReadingId: readingId,
        readingSessionId, sourceBirthRevisionId,
      });
      p.sourceVerifier.verifyProductionIssue.mockResolvedValueOnce({
        ...verified, sourceBirthInputHash: badHash,
      });
      const result = await persistIssuedSajuOfficialReadingV1(input(p));
      expect(result).toMatchObject({
        state: 'held', reason: 'production_source_unverified',
        canDisclose: false, canSell: false,
      });
      expect(p.mappingVerifier.verifyIssuedReadingMapping).not.toHaveBeenCalled();
      expect(p.currentAuthority.admitCurrentIssue).not.toHaveBeenCalled();
      expect(p.commitPort.finalizeSuccess).not.toHaveBeenCalled();
    }
  });

  it('rejects non-ID payload changes or DB mapping with a different subject, hash or session', async () => {
    for (const wrong of [
      { subjectId: '88888888-8888-4888-8888-888888888888' },
      { readingSessionId: '99999999-9999-4999-8999-999999999999' },
      { originalResponseHash: 'c'.repeat(64) },
      { storedResponseHash: 'd'.repeat(64) },
      { nativeReadingId: 'replaced_reading' },
    ]) {
      const p = ports();
      const original = await p.mappingVerifier.verifyIssuedReadingMapping(input(p) as never);
      p.mappingVerifier.verifyIssuedReadingMapping.mockResolvedValueOnce({ ...original, ...wrong });
      const result = await persistIssuedSajuOfficialReadingV1(input(p));
      expect(result).toMatchObject({ state: 'held', reason: 'db_mapping_unverified' });
      expect(p.currentAuthority.admitCurrentIssue).not.toHaveBeenCalled();
      expect(p.commitPort.finalizeSuccess).not.toHaveBeenCalled();
    }
  });

  it('rechecks current subject/birth/Grant/Privacy admission before DB commit', async () => {
    const p = ports();
    p.currentAuthority.admitCurrentIssue.mockResolvedValueOnce(false);
    const result = await persistIssuedSajuOfficialReadingV1(input(p));
    expect(result).toMatchObject({ state: 'held', reason: 'current_authority_unavailable' });
    expect(p.commitPort.finalizeSuccess).not.toHaveBeenCalled();
  });

  it('refuses a DB receipt with changed committed identity or response hash', async () => {
    for (const wrong of [
      { readingId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      { executionAttemptId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      { responseHash: 'sha256:v1:' + 'a'.repeat(64) },
    ]) {
      const p = ports();
      p.commitPort.finalizeSuccess.mockResolvedValueOnce({
        readingId, executionAttemptId, responseHash: storedHash, replayed: false,
        ...wrong,
      });
      await expect(persistIssuedSajuOfficialReadingV1(input(p))).rejects.toThrow(/commit receipt/);
    }
  });

  it('uses existing atomic PostgreSQL finalize command, never writing readings/refs directly', async () => {
    const query = vi.fn(async (sql: string, _params?: readonly unknown[]) => ({
      rows: sql.includes('from public.reading_refs rr')
        ? [{
          nativeReadingId, externalRequestRef: 'internal-only-ref',
          sourceBirthInputHash: 'sha256:v1:' + 'b'.repeat(64),
          readingContractVersion: 'myeonghwa-product-reading-response-v2',
          productResponseState: 'delivered',
          storedSnapshot: dbSnapshot, storedResponseHash: storedHash,
        }]
        : [{ readingId, executionAttemptId, responseHash: storedHash, replayed: true }],
    }));
    const port = createPostgresSajuOfficialImmutableCommitPortV1({
      query,
    } as unknown as PostgresTransactionQueryV1);
    const p = ports();
    const result = await persistIssuedSajuOfficialReadingV1({
      ...input(p), commitPort: port,
    });
    expect(result).toMatchObject({ state: 'committed', replayed: true });
    expect(SAJU_OFFICIAL_DB_FINALIZE_AUTHORITY_V1).toBe('public.cmd_finalize_reading_transport_success_v1');
    expect(query).toHaveBeenCalledTimes(2);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('from public.cmd_finalize_reading_transport_success_v1(');
    expect(sql).not.toMatch(/update public\.readings|insert into public\.reading_refs/iu);
    expect(params).toHaveLength(16);
    expect(params.slice(0, 4)).toEqual([subjectId, readingId, executionAttemptId, outboxEventId]);
    expect(params[6]).toBe(nativeReadingId);
    expect(params[8]).toBeNull();
    expect(params[14]).toBe(JSON.stringify(dbSnapshot));
    expect(params[15]).toBe(storedHash);
    const [readSql, readParams] = query.mock.calls[1] as unknown as [string, unknown[]];
    expect(readSql).toContain('from public.reading_refs rr');
    expect(readSql).toContain('join public.reading_execution_attempts rea');
    expect(readParams).toEqual([subjectId, readingId, executionAttemptId]);
  });

  it('rejects a replay with a different native Saju issuer reference or mutated DB JSONB', async () => {
    for (const wrong of [
      { nativeReadingId: 'other-native-id' },
      { externalRequestRef: 'other-issuer-proof' },
      { storedSnapshot: { ...dbSnapshot, reading: { ...dbSnapshot.reading, disclosures: [] } } },
    ]) {
      const query = vi.fn(async (sql: string, _params?: readonly unknown[]) => ({
        rows: sql.includes('from public.reading_refs rr') ? [{
          nativeReadingId, externalRequestRef: 'internal-only-ref',
          sourceBirthInputHash: 'sha256:v1:' + 'b'.repeat(64),
          readingContractVersion: 'myeonghwa-product-reading-response-v2',
          productResponseState: 'delivered',
          storedSnapshot: dbSnapshot, storedResponseHash: storedHash,
          ...wrong,
        }] : [{ readingId, executionAttemptId, responseHash: storedHash, replayed: true }],
      }));
      const p = ports();
      const writer = createPostgresSajuOfficialImmutableCommitPortV1({
        query,
      } as unknown as PostgresTransactionQueryV1);
      await expect(persistIssuedSajuOfficialReadingV1({
        ...input(p), commitPort: writer,
      })).rejects.toThrow(/stored lineage/);
      expect(query).toHaveBeenCalledTimes(2);
    }
  });

  it('rejects missing or multiple PostgreSQL finalize receipts', async () => {
    for (const rows of [[], [
      { readingId, executionAttemptId, responseHash: storedHash, replayed: false },
      { readingId, executionAttemptId, responseHash: storedHash, replayed: false },
    ]]) {
      const port = createPostgresSajuOfficialImmutableCommitPortV1({
        query: vi.fn(async () => ({ rows })),
      } as unknown as PostgresTransactionQueryV1);
      await expect(port.finalizeSuccess({
        subjectId, readingId, executionAttemptId, outboxEventId,
        externalRequestRef: 'internal-only-ref', engineVersion: 'saju-engine-v1',
        nativeReadingId, sourceResponseHash: sourceHash,
        sourceBirthInputHash: 'sha256:v1:' + 'b'.repeat(64),
        readingContractVersion: 'myeonghwa-product-reading-response-v2',
        productResponseState: 'delivered', storedSnapshot: dbSnapshot,
        storedResponseHash: storedHash,
      })).rejects.toThrow(/exactly one receipt/);
    }
  });
});
