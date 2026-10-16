import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';
import {
  handleSeyeonChatTurnSendRequestV1,
  type SeyeonChatTurnControlledDisclosurePortV1,
} from '../apps/api/src/chat-turn-send-http.js';

const ENABLED = process.env.CI === 'true' &&
  process.env.SEYEON_POSITIVE_GRANT_REAL_PG === '1' &&
  process.env.PGHOST === 'localhost' &&
  process.env.PGDATABASE === 'myeongha_seyeon_positive_pin_candidate_test';

const AUTH_USER = 'd1000000-0000-4000-8000-000000000001';
const SUBJECT = 'd2000000-0000-4000-8000-000000000001';
const THREAD = 'd4000000-0000-4000-8000-000000000001';
const TURN = 'd7000000-0000-4000-8000-000000000001';
const ATTEMPT = 'd7200000-0000-4000-8000-000000000001';
const MEMORY = 'd5000000-0000-4000-8000-000000000001';
const ORIGINAL_GRANT = 'd6000000-0000-4000-8000-000000000001';
const MESSAGE = 'd8000000-0000-4000-8000-000000000001';
const CLIENT_TURN = 'd9000000-0000-4000-8000-000000000001';

const pool = ENABLED
  ? new Pool({ max: 3, connectionTimeoutMillis: 5000, statement_timeout: 5000 })
  : null;

const subjectPool: PostgresSubjectPoolV1 = {
  async connect() {
    if (!pool) throw new Error('Refuse unisolated PostgreSQL test execution.');
    const driver = await pool.connect();
    return {
      async query<Row = Record<string, unknown>>(
        sql: string,
        values: readonly unknown[] = [],
      ): Promise<{ readonly rows: readonly Row[] }> {
        const result = await driver.query(sql, values as unknown[]);
        return { rows: result.rows as readonly Row[] };
      },
      release(error) {
        driver.release(Boolean(error));
      },
    };
  },
};

const disclosurePort: SeyeonChatTurnControlledDisclosurePortV1 = {
  async reveal(input) {
    try {
      return await executePostgresSubjectTransactionV1({
        pool: subjectPool,
        verifiedEvidence: input.verifiedEvidence,
        execute: async ({ resolvedSubject, client }) => {
          // Test-only adapter: service data cannot override subject binding.
          // The production-approved Grant/Attempt/Message reveal SQL is NOT
          // present and this test schema cannot exist outside disposable CI.
          if (resolvedSubject.subjectId !== input.subjectId ||
              input.subjectId !== SUBJECT ||
              input.threadId !== THREAD || input.turnId !== TURN ||
              input.attemptId !== ATTEMPT || input.assistantMessageId !== MESSAGE) {
            return { state: 'held' as const };
          }
          const result = await client.query<{ assistantText: string | null }>(
            'select seyeon_positive_candidate.reveal_test_v1($1::uuid,$2::uuid) as "assistantText"',
            [resolvedSubject.subjectId, input.attemptId],
          );
          const text = result.rows[0]?.assistantText;
          if (result.rows.length !== 1 || typeof text !== 'string' ||
              text.length === 0) return { state: 'held' as const };
          return { state: 'authorized' as const, assistantText: text };
        },
      });
    } catch {
      return { state: 'held' as const };
    }
  },
};

function request() {
  return new Request('https://myeongha.internal/api/chat/' + THREAD + '/turns', {
    method: 'POST',
    headers: { authorization: 'Bearer synthetic', 'content-type': 'application/json' },
    body: JSON.stringify({ clientTurnId: CLIENT_TURN, text: 'synthetic request' }),
  });
}

function fakeExecution(disposition: 'executed' | 'committed_replay', subjectId = SUBJECT) {
  return {
    runtimeVersion: 'production-seyeon-chat-runtime-v1',
    subjectId,
    threadBinding: { threadId: THREAD, participantCharacterIds: ['seyeon'] },
    bundleManifest: {},
    execution: {
      version: 'seyeon-production-chat-execution-v1',
      disposition,
      committedTurn: {
        turnId: TURN,
        attemptId: ATTEMPT,
        assistantMessageId: MESSAGE,
        sequenceNo: 2,
        replayed: disposition === 'committed_replay',
      },
      assistantText: 'UNAUTHORIZED_RAW_REPLAY',
      runtimeResult: { envelope: { utterance: 'UNAUTHORIZED_RAW_NEW' } },
    },
  } as never;
}

async function http(disposition: 'executed' | 'committed_replay', subjectId = SUBJECT) {
  return handleSeyeonChatTurnSendRequestV1({
    request: request(),
    requestId: 'offline-controlled-reveal-ci',
    serverTime: '2026-10-12T00:00:00.000Z',
    identityEvidenceVerifier: {
      verifyRequestIdentity: async () => ({
        kind: 'member' as const, verifiedAuthUserId: AUTH_USER,
      }),
    },
    controlledDisclosurePort: disclosurePort,
    runtime: { run: async () => fakeExecution(disposition, subjectId) },
  });
}

describe.skipIf(!ENABLED)(
  'Real disposable PostgreSQL positive exact Grant -> HTTP controlled reveal/replay candidate',
  () => {
    afterAll(async () => {
      await pool?.end();
    });

    it('returns only DB-current-rights text for both first execution and committed replay', async () => {
      for (const disposition of ['executed', 'committed_replay'] as const) {
        const response = await http(disposition);
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        const text = await response.text();
        expect(text).toContain('SYNTHETIC_APPROVED_REPLY');
        expect(text).not.toContain('UNAUTHORIZED_RAW_NEW');
        expect(text).not.toContain('UNAUTHORIZED_RAW_REPLAY');
      }
    });

    it('blocks cross-Subject injection before reading private source text', async () => {
      const response = await http('committed_replay',
        'd2000000-0000-4000-8000-000000000099');
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain('SYNTHETIC_APPROVED_REPLY');
    });

    it('revoking the original Grant prevents both first response and replay', async () => {
      if (!pool) throw new Error('isolated PostgreSQL missing');
      await pool.query(
        'update public.record_access_grants set revoked_at=clock_timestamp() where id=$1::uuid',
        [ORIGINAL_GRANT],
      );
      for (const disposition of ['executed', 'committed_replay'] as const) {
        const response = await http(disposition);
        expect(response.status).toBe(503);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.text()).not.toContain('SYNTHETIC_APPROVED_REPLY');
      }
    });

    it('new independent Grant does not restore former Attempt text; content stays private', async () => {
      if (!pool) throw new Error('isolated PostgreSQL missing');
      await pool.query(`
        insert into public.record_access_grants(
          id,subject_id,life_fact_id,memory_item_id,grantee_character_id,
          grant_reason,granted_at,revoked_at
        ) values (
          'd6000000-0000-4000-8000-000000000004',$1::uuid,null,$2::uuid,
          'seyeon','user_choice',clock_timestamp(),null
        )
      `, [SUBJECT, MEMORY]);
      const response = await http('committed_replay');
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain('SYNTHETIC_APPROVED_REPLY');
      const active = await pool.query(
        'select count(*)::integer as n from public.record_access_grants where memory_item_id=$1::uuid and revoked_at is null',
        [MEMORY],
      );
      expect(active.rows[0]?.n).toBe(1);
    });
  },
);
