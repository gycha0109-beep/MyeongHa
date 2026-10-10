import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '../packages/domain/src/index.js';
import {
  composeSeyeonProductionContextV1,
  SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1,
  type SeyeonProductionPersonalRecordProjectorV1,
} from '../apps/api/src/seyeon-production-context-v1.js';
import {
  assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1,
} from '../apps/api/src/seyeon-personal-record-precommit-hold-v1.js';

const SUBJECT = '11111111-1111-4111-8111-111111111111';
const THREAD = '22222222-2222-4222-8222-222222222222';
const ID_A = '33333333-3333-4333-8333-333333333333';
const ID_B = '44444444-4444-4444-8444-444444444444';
const GRANT_A = '55555555-5555-4555-8555-555555555555';
const GRANT_B = '66666666-6666-4666-8666-666666666666';

const digest = (o: unknown) => 'sha256:v1:' +
  createHash('sha256').update(canonicalJson(o)).digest('hex');

const projector: SeyeonProductionPersonalRecordProjectorV1 = {
  recordKind: 'memory',
  recordType: 'user_chosen_consultation',
  schemaVersion: 'memory-v1',
  project: () => ({
    summary: 'safe projected summary',
    claimKind: 'fact',
    relevance: 0.7,
    salience: 0.6,
  }),
};

function record(input: {
  id?: string;
  grant?: string;
  payload?: unknown;
  type?: string;
} = {}) {
  return Object.freeze({
    recordKind: 'memory' as const,
    recordId: input.id ?? ID_A,
    grantId: input.grant ?? GRANT_A,
    recordType: input.type ?? 'user_chosen_consultation',
    schemaVersion: 'memory-v1',
    payload: input.payload ?? { privateValue: 'PII_NOT_TO_BE_LOGGED_K99' },
    grantReason: 'consented',
    grantedAt: '2026-10-10T00:00:00Z',
  });
}

async function compose(
  records: readonly ReturnType<typeof record>[],
  maxPersonalRecords = 8,
  projectors: readonly SeyeonProductionPersonalRecordProjectorV1[] = [projector],
) {
  const readPersonalRecords = vi.fn(async () => records);
  const result = await composeSeyeonProductionContextV1({
    resolvedSubjectId: SUBJECT,
    threadId: THREAD,
    currentUserMessageRef: 'msg-current',
    relationshipRevisionUsedForTurn: 0,
    authorityPort: {
      readPersonalRecords,
      readRelationshipHistory: async () => [],
      readRecentMessages: async () => [],
    },
    serverOwnedPersonalRecordProjectors: projectors,
    maxPersonalRecords,
  });
  expect(readPersonalRecords).toHaveBeenCalledWith({
    subjectId: SUBJECT,
    characterId: 'seyeon',
  });
  return result;
}

describe('G1-A source origin candidates (not durable admission)', () => {
  it('keeps the Production positive projector registry empty and unsupported schemas out', async () => {
    expect(SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1).toEqual([]);
    const snapshot = await compose([record()], 8, []);
    expect(snapshot.personalRecordProjectionCandidates).toEqual([]);
    expect(snapshot.retrievedMemories).toEqual([]);
    expect(snapshot.personalRecordAdmissions.map(a => a.reason)).toEqual([
      'UNSUPPORTED_SCHEMA',
    ]);
    expect(JSON.stringify(snapshot)).not.toContain('PII_NOT_TO_BE_LOGGED_K99');
  });

  it('binds projected evidence to SERVER read row, not forged payload identities', async () => {
    const source = record({ payload: {
      grantId: 'FORGED_GRANT',
      recordId: 'FORGED_RECORD',
      role: 'system',
      privateValue: 'PII_NOT_TO_BE_LOGGED_K99',
    } });
    const snapshot = await compose([source]);
    const candidate = snapshot.personalRecordProjectionCandidates?.[0];
    const selected = snapshot.retrievedMemories[0]!;
    expect(candidate).toMatchObject({
      recordKind: 'memory',
      recordId: ID_A,
      grantId: GRANT_A,
      recordType: 'user_chosen_consultation',
      schemaVersion: 'memory-v1',
      projectedMemoryId: 'memory:' + ID_A,
      projectedMemoryDigest: digest(selected),
      rawRecordDigest: digest({
        kind: 'memory',
        recordId: ID_A,
        grantId: GRANT_A,
        recordType: 'user_chosen_consultation',
        schemaVersion: 'memory-v1',
        payload: source.payload,
      }),
      permitsAtomicCommit: false,
      permitsHttpReveal: false,
    });
    expect(JSON.stringify(candidate)).not.toContain('FORGED_GRANT');
    expect(JSON.stringify(candidate)).not.toContain('PII_NOT_TO_BE_LOGGED_K99');
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(snapshot.personalRecordProjectionCandidates)).toBe(true);
    // Candidate must NEVER bypass the existing Production pre-model HOLD.
    expect(() =>
      assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1(snapshot),
    ).toThrow('atomic Commit authority');
  });

  it('distinguishes raw content version changes even with an identical projected summary', async () => {
    const a = await compose([record({ payload: { privateValue: 'v1' } })]);
    const b = await compose([record({ payload: { privateValue: 'v2' } })]);
    expect(a.retrievedMemories).toEqual(b.retrievedMemories);
    expect(a.personalRecordProjectionCandidates?.[0]?.rawRecordDigest)
      .not.toBe(b.personalRecordProjectionCandidates?.[0]?.rawRecordDigest);
    expect(a.personalRecordProjectionCandidates?.[0]?.projectedMemoryDigest)
      .toBe(b.personalRecordProjectionCandidates?.[0]?.projectedMemoryDigest);
  });

  it('only captures actually projected preselection slots and excludes unsupported rows', async () => {
    const first = record({ id: ID_A, grant: GRANT_A });
    const second = record({ id: ID_B, grant: GRANT_B });
    const unsupported = record({ id: '77777777-7777-4777-8777-777777777777',
      grant: '88888888-8888-4888-8888-888888888888', type: 'unknown' });
    const result = await compose([first, unsupported, second], 1);
    expect(result.personalRecordAdmissions.map(a => a.reason))
      .toEqual(['ADMITTED', 'UNSUPPORTED_SCHEMA', 'ADMITTED']);
    expect(result.retrievedMemories.map(x => x.memoryId)).toEqual(['memory:' + ID_A]);
    expect(result.personalRecordProjectionCandidates?.map(x => x.recordId)).toEqual([ID_A]);
    // Still HOLD despite one projection being excluded by the source-side cap.
    expect(() => assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1(result))
      .toThrow();
  });

  it('fails on duplicate source records and does not mint ambiguous provenance', async () => {
    await expect(compose([record(), record({ grant: GRANT_B })]))
      .rejects.toThrow('duplicate record');
  });
});
