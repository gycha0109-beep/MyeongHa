import { describe, expect, it, vi } from 'vitest';
import {
  createPostgresStandardFollowupAnchorAuthorityPortV1,
  POSTGRES_STANDARD_FOLLOWUP_ANCHOR_BINDING_V1,
} from '../apps/api/src/postgres-standard-followup-anchor-v1.js';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';

const SUBJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const THREAD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const READING = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MESSAGE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const UNIT_A = `grounding_unit_${'a'.repeat(24)}`;
const UNIT_B = `grounding_unit_${'b'.repeat(24)}`;
const scope = Object.freeze({
  subjectId: SUBJECT, threadId: THREAD, readingRef: READING,
  readerCharacterId: 'baekheon',
});
const validRow = Object.freeze({
  status: 'committed_semantic_guard_pass',
  subjectId: SUBJECT, threadId: THREAD, readerCharacterId: 'baekheon',
  readingRef: READING, officialArtifactResponseHash: `sha256:v1:${'1'.repeat(64)}`,
  groundingHash: '2'.repeat(64), assistantMessageId: MESSAGE,
  sourceUnitRefs: [UNIT_A, UNIT_B], focusedUnitRef: UNIT_A,
});

function mock(rows: unknown[] = [validRow]) {
  const query = vi.fn(async () => ({ rows }));
  const client = { query } as unknown as PostgresTransactionQueryV1;
  return { query, port: createPostgresStandardFollowupAnchorAuthorityPortV1(client) };
}

describe('A3-theta PostgreSQL Standard Reading follow-up anchor contract (dormant)', () => {
  it('uses exact four-dimension scoped DB owner query and never reads raw Chat transcript', async () => {
    const { port, query } = mock();
    const result = await port.readLatestValidatedAnchor(scope);
    expect(result).toEqual(validRow);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result?.sourceUnitRefs)).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain(POSTGRES_STANDARD_FOLLOWUP_ANCHOR_BINDING_V1);
    expect(query.mock.calls[0]?.[0]).not.toMatch(/from public\.(chat_turn_attempts|conversation_messages|ai_execution_groundings)/u);
    expect(query.mock.calls[0]?.[1]).toEqual([SUBJECT, THREAD, 'baekheon', READING]);
  });

  it('treats no committed semantic evidence as null rather than recycling Seyeon UUID refs', async () => {
    const { port } = mock([]);
    await expect(port.readLatestValidatedAnchor(scope)).resolves.toBeNull();
  });

  it('rejects invalid input before making any database query', async () => {
    const { port, query } = mock();
    await expect(port.readLatestValidatedAnchor({
      ...scope, subjectId: 'forged',
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(port.readLatestValidatedAnchor({
      ...scope, readerCharacterId: '',
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(query).not.toHaveBeenCalled();
  });

  it('denies missing/unavailable function, database errors and permission failures', async () => {
    const { port, query } = mock();
    query.mockRejectedValueOnce(Object.assign(new Error('undefined function'), { code: '42883' }));
    await expect(port.readLatestValidatedAnchor(scope))
      .rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    query.mockRejectedValueOnce(Object.assign(new Error('permission denied'), { code: '42501' }));
    await expect(port.readLatestValidatedAnchor(scope))
      .rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });

  it('never picks an arbitrary row if DB returns several candidates', async () => {
    const { port } = mock([validRow, validRow]);
    await expect(port.readLatestValidatedAnchor(scope))
      .rejects.toMatchObject({ code: 'INVALID_PROVENANCE' });
  });

  it.each([
    { subjectId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' },
    { threadId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' },
    { readingRef: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' },
    { readerCharacterId: 'seyeon' },
    { status: 'validated' },
    { status: 'generated' },
    { assistantMessageId: null },
    { officialArtifactResponseHash: 'sha256:v1:unproven' },
    { groundingHash: 'f'.repeat(63) },
    { sourceUnitRefs: [] },
    { sourceUnitRefs: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] },
    { sourceUnitRefs: [UNIT_A, UNIT_A] },
    { focusedUnitRef: UNIT_B, sourceUnitRefs: [UNIT_A] },
    { sourceUnitRefs: [UNIT_A, ...Array.from({length:12}, (_, i) => `grounding_unit_${i.toString(16).padStart(24,'0')}`)] },
  ])('rejects forged/wrong-scope/unproven DB response %#', async (override) => {
    const { port } = mock([{ ...validRow, ...override }]);
    await expect(port.readLatestValidatedAnchor(scope))
      .rejects.toMatchObject({ code: 'INVALID_PROVENANCE' });
  });

  it('returns no arbitrary focus when the DB supplies no focused Unit', async () => {
    const { port } = mock([{ ...validRow, focusedUnitRef: null }]);
    const result = await port.readLatestValidatedAnchor(scope);
    expect(result).not.toHaveProperty('focusedUnitRef');
    expect(result?.sourceUnitRefs).toEqual([UNIT_A, UNIT_B]);
  });
});
