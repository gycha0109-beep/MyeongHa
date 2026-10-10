import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../packages/domain/src/index.js';
import {
  createSeyeonAttemptZeroPersonalProofV1,
  SeyeonAttemptZeroPersonalProofHoldV1,
} from '../apps/api/src/seyeon-attempt-zero-personal-proof-v1.js';

type SourceContext = Parameters<typeof createSeyeonAttemptZeroPersonalProofV1>[0]['context'];

const subjectId = '11111111-1111-4111-8111-111111111111';
const threadId = '22222222-2222-4222-8222-222222222222';
const turnId = '33333333-3333-4333-8333-333333333333';
const attemptId = '44444444-4444-4444-8444-444444444444';

const context = (
  records: unknown[] = [],
  admissions: unknown[] = [],
): SourceContext => ({
  version: 'seyeon-production-context-v1',
  retrievedMemories: records,
  personalRecordAdmissions: admissions,
}) as SourceContext;

const mint = (
  overrides: Partial<Parameters<typeof createSeyeonAttemptZeroPersonalProofV1>[0]> = {},
) => createSeyeonAttemptZeroPersonalProofV1({
  subjectId, threadId, turnId, attemptId,
  context: context(),
  ...overrides,
});

describe('Se-yeon server-owned zero-record attempt provenance', () => {
  it('mints an explicit, immutable, attempt-scoped zero marker and reproducible checksum', () => {
    const proof = mint();
    expect(proof).toMatchObject({
      schemaVersion: 'seyeon-attempt-zero-personal-proof-v1',
      source: 'server-composed-context',
      subjectId, threadId, turnId, attemptId,
      characterId: 'seyeon',
      recordState: 'explicit_zero_admitted',
      recordCount: 0,
      records: [],
      unsupportedSchemaCount: 0,
      permitsAtomicPersonalRecordCommit: false,
      permitsHttpReveal: false,
    });
    const { proofDigest, permitsAtomicPersonalRecordCommit, permitsHttpReveal, ...material } = proof;
    expect(proofDigest).toBe('sha256:v1:' +
      createHash('sha256').update(canonicalJson(material)).digest('hex'));
    expect(Object.isFrozen(proof)).toBe(true);
    expect(Object.isFrozen(proof.records)).toBe(true);
    expect(mint()).toEqual(proof);
    expect(mint({ attemptId: '55555555-5555-4555-8555-555555555555' }).proofDigest)
      .not.toBe(proof.proofDigest);
    expect(mint({ turnId: '66666666-6666-4666-8666-666666666666' }).proofDigest)
      .not.toBe(proof.proofDigest);
  });

  it('distinguishes excluded unsupported schemas from admitted personal records', () => {
    const unsupported = { recordId: 'record-id', recordKind: 'memory',
      recordType: 'unknown', schemaVersion: 'v9', reason: 'UNSUPPORTED_SCHEMA' };
    const proof = mint({ context: context(
      [{ kind: 'relationship_event', sourceRef: 'relationship-event:synthetic' }],
      [unsupported],
    ) });
    expect(proof.recordCount).toBe(0);
    expect(proof.unsupportedSchemaCount).toBe(1);
    expect(JSON.stringify(proof)).not.toContain('record-id');
    expect(JSON.stringify(proof)).not.toContain('relationship-event:synthetic');
    expect(JSON.stringify(proof)).not.toContain('memory');
  });

  it('fails closed on any admitted memory, life fact, malformed or absent source evidence', () => {
    for (const value of [
      context([{ kind: 'memory' }], []),
      context([{ kind: 'life_fact' }], []),
      context([], [{ reason: 'ADMITTED' }]),
      context([], [{ reason: 'NEW_UNTRUSTED_REASON' }]),
      context([], [null]),
      context([null]),
      context([{}]),
      {} as SourceContext,
      null as unknown as SourceContext,
      { version: 'seyeon-production-context-v1', retrievedMemories: [] } as SourceContext,
      { version: 'unexpected', retrievedMemories: [], personalRecordAdmissions: [] } as unknown as SourceContext,
    ]) {
      expect(() => mint({ context: value })).toThrow(SeyeonAttemptZeroPersonalProofHoldV1);
    }
  });

  it('fails on missing or malformed Subject/Turn/Attempt identities rather than generating an anonymous proof', () => {
    for (const bad of ['', '  ', ' bad', 'bad ', 'x'.repeat(257)]) {
      expect(() => mint({ subjectId: bad })).toThrow(SeyeonAttemptZeroPersonalProofHoldV1);
      expect(() => mint({ threadId: bad })).toThrow(SeyeonAttemptZeroPersonalProofHoldV1);
      expect(() => mint({ turnId: bad })).toThrow(SeyeonAttemptZeroPersonalProofHoldV1);
      expect(() => mint({ attemptId: bad })).toThrow(SeyeonAttemptZeroPersonalProofHoldV1);
    }
  });

  it('binds the server proof before model calls and persists the same proof in validated attempt material', async () => {
    const runtime = await readFile(
      new URL('../apps/api/src/seyeon-production-chat-execution-v1.ts', import.meta.url),
      'utf8',
    );
    const minted = runtime.indexOf('const personalRecordProof = createSeyeonAttemptZeroPersonalProofV1({');
    const model = runtime.indexOf('const runtime = await runSeyeonCharacterTurnV2({');
    const validate = runtime.indexOf('await input.persistencePort.persistValidated({');
    const persist = runtime.indexOf('personalRecordProvenance: personalRecordProof,');
    const commit = runtime.indexOf('const committed = await input.persistencePort.commitTurn({');
    expect(minted).toBeGreaterThan(-1);
    expect(model).toBeGreaterThan(minted);
    expect(validate).toBeGreaterThan(model);
    expect(persist).toBeGreaterThan(validate);
    expect(commit).toBeGreaterThan(persist);

    const sql = await readFile(
      new URL('../supabase/migrations/0220_chat_attempt_commit_commands.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('validation_result_jsonb = p_validation_result_jsonb');
    expect(sql).toContain('tr_chat_turn_attempt_validation_immutable');
    // SQL text checks are NOT a substitute for PostgreSQL state/ACL tests.
  });
});
