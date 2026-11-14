import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APPROVED_SAJU_CATALOG_V1 } from '../../../packages/contracts/src/approved-saju-catalog.js';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  issue: vi.fn(),
  source: vi.fn(() => ({ issue: 'synthetic' })),
}));
const SUBJECT = '11111111-1111-4111-8111-111111111111';
const AUTH = '22222222-2222-4222-8222-222222222222';
const PURCHASE = '33333333-3333-4333-8333-333333333333';
const JOB = '44444444-4444-4444-8444-444444444444';
const RELEASE = 'verified-saju-release-v1';
const selfComponents = ['career', 'business', 'wealth', 'relationship', 'year', 'month'] as const;
let alreadyIssued = false;
let signedCommit = false;
let hasCurrentGrant = true;
let completionCalls = 0;

vi.mock('./postgres-subject-execution.js', () => ({
  executePostgresApprovedSajuIssuerJobTransactionV1: async (
    input: { execute: (client: unknown) => Promise<unknown> },
  ) => input.execute({ query: mocks.query }),
  executePostgresApprovedSajuIssuerTransactionV1: async (
    input: { execute: (context: unknown) => Promise<unknown> },
  ) => input.execute({
    client: { query: mocks.query },
    resolvedSubject: { subjectId: hasCurrentGrant ? SUBJECT : '99999999-9999-4999-8999-999999999999' },
  }),
}));
vi.mock('./postgres-approved-saju-issuance-v1.js', () => ({
  executeApprovedSajuOfficialReadingV1: mocks.issue,
}));
vi.mock('./saju-production-reading-issue-source-v1.js', () => ({
  createSajuProductionReadingIssueSourceV1: mocks.source,
}));
import { createApprovedSajuIssuanceWorkerV1 } from './approved-saju-issuance-worker-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

const pool = { connect: vi.fn() } as unknown as PostgresSubjectPoolV1;
const releases = Object.fromEntries(selfComponents.map(component =>
  [component, { releaseRef: RELEASE, readerCharacterId: 'seyeon' }],
));
const createWorker = () => createApprovedSajuIssuanceWorkerV1({
  pool,
  source: { baseUrl: 'https://saju.example', bearerToken: 'synthetic-secret' } as never,
  releases,
  engineKey: 'saju',
  engineVersion: 'test-engine',
});

beforeEach(() => {
  vi.clearAllMocks();
  alreadyIssued = false;
  signedCommit = false;
  hasCurrentGrant = true;
  completionCalls = 0;
  mocks.issue.mockResolvedValue({ state: 'committed', readingId: JOB });
  mocks.query.mockImplementation(async (sql: string, args: unknown[]) => {
    if (sql.includes('cmd_claim_approved_saju_issue_job_v1')) {
      const configured = JSON.parse(String(args[1])) as Record<string, string>;
      return { rows: [{
        job_id: JOB, subject_id: SUBJECT, auth_user_id: AUTH,
        purchase_intent_id: PURCHASE, component: 'wealth',
        release_ref: configured.wealth, already_issued: alreadyIssued,
      }] };
    }
    if (sql.includes('qry_approved_saju_issue_job_status_v1')) {
      return { rows: [{ attempt_no: signedCommit ? 1 : null, signed_commit: signedCommit }] };
    }
    if (sql.includes('cmd_complete_approved_saju_issue_job_v1')) {
      completionCalls += 1;
      return { rows: [{ completed: true }] };
    }
    throw new Error('Unexpected query: ' + sql);
  });
});

describe('approved Saju paid-issue worker signing / outbox ACK boundary', () => {
  it('never completes an old binding without a verified signed Source receipt', async () => {
    alreadyIssued = true;
    expect(await createWorker().runNext()).toMatchObject({
      state: 'held', component: 'wealth', reason: 'missing_signed_receipt',
      localAttempt: 'not_allocated',
    });
    expect(completionCalls).toBe(0);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it('does not ACK a reported source commit when the DB has no signed commit', async () => {
    expect(await createWorker().runNext()).toMatchObject({
      state: 'held', reason: 'missing_signed_receipt',
    });
    expect(completionCalls).toBe(0);
    expect(mocks.issue).toHaveBeenCalledTimes(1);
  });

  it('does not ACK a revoked grant even when a previous issued reading exists', async () => {
    alreadyIssued = true;
    signedCommit = true;
    hasCurrentGrant = false;
    expect(await createWorker().runNext()).toMatchObject({
      state: 'held', reason: 'missing_signed_receipt', localAttempt: 'unavailable',
    });
    expect(completionCalls).toBe(0);
  });

  it('ACKs a recovered issue only when the current grant and signed receipt match', async () => {
    alreadyIssued = true;
    signedCommit = true;
    expect(await createWorker().runNext()).toEqual({ state: 'issued' });
    expect(completionCalls).toBe(1);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it('ACKs a new signed issue once, after checking DB durable proof', async () => {
    signedCommit = true;
    expect(await createWorker().runNext()).toEqual({ state: 'issued' });
    expect(completionCalls).toBe(1);
    expect(mocks.issue).toHaveBeenCalledTimes(1);
  });

  it('keeps the catalog at 14 distinct approved offers, including paired components', () => {
    expect(APPROVED_SAJU_CATALOG_V1).toHaveLength(14);
    expect(new Set(APPROVED_SAJU_CATALOG_V1.map(offer => offer.id)).size).toBe(14);
    expect(new Set(APPROVED_SAJU_CATALOG_V1.flatMap(offer => offer.components)))
      .toEqual(new Set([...selfComponents, 'compatibility']));
    expect(APPROVED_SAJU_CATALOG_V1.filter(offer => offer.components.includes('compatibility')))
      .toHaveLength(3);
  });
});
