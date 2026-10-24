import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createPostgresPortOneIdentityAgeAuthorityV1,
  POSTGRES_PORTONE_IDENTITY_AUTHORITY_BINDINGS_V1,
} from '../apps/api/src/postgres-portone-identity-age-authority-v1.js';
import type {
  PostgresSubjectConnectionV1,
  PostgresQueryResultV1,
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';

const memberAuthId = '91000000-0000-0000-0000-000000000001';
const subjectId = '92000000-0000-0000-0000-000000000001';
const identityVerificationId = 'iv_' + 'a'.repeat(32);
const expiresAt = '2026-10-23T07:10:00.000Z';
const evidence = { kind: 'member', verifiedAuthUserId: memberAuthId } as const;

type Call = { sql: string; args: readonly unknown[] };
class FakeDb implements PostgresSubjectConnectionV1 {
  calls: Call[] = [];
  releases = 0;
  pending = true;
  consumeResult = true;
  issueMalformed = false;
  query<Row = Record<string, unknown>>(sql: string, args: readonly unknown[] = []): PostgresQueryResultV1<Row> {
    this.calls.push({ sql, args });
    if (sql.includes('begin_member_subject_context_v1')) {
      return { rows: [{ subjectId, subjectKind: 'member' }] as unknown as Row[] };
    }
    if (sql.includes('cmd_issue_legal_portone_identity_v1')) {
      return { rows: [{
        identityVerificationId: this.issueMalformed ? 'bad' : identityVerificationId,
        expiresAt,
      }] as unknown as Row[] };
    }
    if (sql.includes('qry_pending_legal_portone_identity_v1')) {
      return { rows: this.pending ? [{
        subjectId, identityVerificationId, status: 'pending',
      }] as unknown as Row[] : [] };
    }
    if (sql.includes('cmd_consume_legal_portone_identity_v1')) {
      return { rows: [{ consumed: this.consumeResult }] as unknown as Row[] };
    }
    return { rows: [] };
  }
  release(): void { this.releases++; }
}
function setup() {
  const db = new FakeDb();
  const pool: PostgresSubjectPoolV1 = { connect: () => db };
  return { db, authority: createPostgresPortOneIdentityAgeAuthorityV1({ pool, verifiedEvidence: evidence }) };
}
function commandCalls(db: FakeDb) {
  return db.calls.filter(x => x.sql.includes('legal_portone_identity_v1'));
}

describe('LEGAL L2: subject-bound Postgres PortOne identity attempt authority', () => {
  it('is proposal-only and pins the established canonical execution role', () => {
    expect(POSTGRES_PORTONE_IDENTITY_AUTHORITY_BINDINGS_V1).toEqual({
      issue: 'public.cmd_issue_legal_portone_identity_v1',
      readPending: 'public.qry_pending_legal_portone_identity_v1',
      consume: 'public.cmd_consume_legal_portone_identity_v1',
      executionRole: 'myeongha_api_executor',
      proposalOnly: true,
    });
  });

  it('issues a DB-owned attempt without passing a client-generated identifier', async () => {
    const { authority, db } = setup();
    await expect(authority.issueIdentityAttempt()).resolves.toEqual({
      identityVerificationId, expiresAt,
    });
    const [query] = commandCalls(db);
    expect(query?.args).toEqual([subjectId]);
    expect(db.calls.map(c => c.sql)).toEqual([
      'BEGIN', 'SET LOCAL ROLE myeongha_api_executor',
      expect.stringContaining('begin_member_subject_context_v1'),
      expect.stringContaining('assert_myeongha_subject_context_v1'),
      expect.stringContaining('cmd_issue_legal_portone_identity_v1'),
      'COMMIT',
    ]);
    expect(db.releases).toBe(1);
  });

  it('queries pending attempt and atomically consumes only the age band in separate short transactions', async () => {
    const { authority, db } = setup();
    const attempt = await authority.readPendingOwnedAttempt({ subjectId, identityVerificationId });
    expect(attempt).toEqual({ subjectId, identityVerificationId, status: 'pending' });
    expect(await authority.consumeAndRecordAgeBand({
      subjectId, identityVerificationId, ageBand: 'adult', serverTime: '2026-10-23T07:00:00Z',
    })).toBe(true);
    expect(commandCalls(db).map(c => c.args)).toEqual([
      [subjectId, identityVerificationId],
      [subjectId, identityVerificationId, 'adult'],
    ]);
    expect(db.calls.filter(c => c.sql === 'COMMIT')).toHaveLength(2);
    expect(db.calls.filter(c => c.sql === 'BEGIN')).toHaveLength(2);
    expect(db.releases).toBe(2);
  });

  it('rejects cross-subject access before invoking the proposed DB commands', async () => {
    const { authority, db } = setup();
    await expect(authority.readPendingOwnedAttempt({
      subjectId: 'other-subject', identityVerificationId,
    })).rejects.toThrow('authenticated subject');
    await expect(authority.consumeAndRecordAgeBand({
      subjectId: 'other-subject', identityVerificationId, ageBand: 'adult', serverTime: '2026-10-23T07:00:00Z',
    })).rejects.toThrow('authenticated subject');
    expect(commandCalls(db)).toEqual([]);
    expect(db.calls.filter(c => c.sql === 'ROLLBACK')).toHaveLength(2);
  });

  it('rejects expired or consumed attempts and never fabricates successful consumption', async () => {
    const { authority, db } = setup();
    db.pending = false;
    expect(await authority.readPendingOwnedAttempt({ subjectId, identityVerificationId })).toBeNull();
    db.consumeResult = false;
    expect(await authority.consumeAndRecordAgeBand({
      subjectId, identityVerificationId, ageBand: 'free_minor', serverTime: '2026-10-23T07:00:00Z',
    })).toBe(false);
    await expect(authority.consumeAndRecordAgeBand({
      subjectId, identityVerificationId, ageBand: 'under14' as never, serverTime: '2026-10-23T07:00:00Z',
    })).rejects.toThrow('invalid');
  });

  it('rolls back and rejects malformed issuance evidence', async () => {
    const { authority, db } = setup();
    db.issueMalformed = true;
    await expect(authority.issueIdentityAttempt()).rejects.toThrow('invalid output');
    expect(db.calls.map(x => x.sql)).toContain('ROLLBACK');
    expect(db.calls.map(x => x.sql)).not.toContain('COMMIT');
  });

  it('proposed SQL preserves server-only ACL, TTL, one active request, atomic consume and no raw identity profile', () => {
    const sql = readFileSync(new URL('../supabase/proposals/1740_portone_identity_age_authority_v1.proposed.sql', import.meta.url), 'utf8');
    expect(sql).toContain("interval '10 minutes'");
    expect(sql).toContain('legal_portone_one_pending_per_subject');
    expect(sql).toContain('for update');
    expect(sql).toContain("a.expires_at>v_now");
    expect(sql).toContain('if not found then return false; end if;');
    expect(sql).toContain('assert_myeongha_subject_context_v1');
    expect(sql).toContain('myeongha_api_executor');
    expect(sql).toContain('on delete cascade');
    expect(sql).toContain('from public, anon, authenticated');
    expect(sql).not.toMatch(/verified_customer|phone_number|birth_date|resident_number|connecting_information|payload_json/u);
  });
});
