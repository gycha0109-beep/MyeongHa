import { describe, expect, it } from 'vitest';
import {
  ApiCommandError,
  getMemoryItems,
  MEMORY_ITEMS_READ_AUTHORITY_BINDING_V1,
  MemoryItemsReadAuthorityPortErrorV1,
  type MemoryItemCurrentAuthorityRowV1,
  type MemoryItemsReadAuthorityPortV1,
} from '../apps/api/src/index.js';

const SUBJECT_ID = '93000000-0000-0000-0000-000000000001';
const PRIVATE_MEMORY_ID = '93000000-0000-0000-0000-000000000202';
const CHARACTER_MEMORY_ID = '93000000-0000-0000-0000-000000000201';

const PRIVATE_MEMORY: MemoryItemCurrentAuthorityRowV1 = Object.freeze({
  memoryItemId: PRIVATE_MEMORY_ID,
  memoryType: 'relationship_memory',
  schemaVersion: 'memory-v1',
  contentJsonb: Object.freeze({ value: 'owner-private' }),
  createdByCharacterId: null,
  createdAt: '2026-08-22T00:00:00.000Z',
});

const CHARACTER_MEMORY: MemoryItemCurrentAuthorityRowV1 = Object.freeze({
  memoryItemId: CHARACTER_MEMORY_ID,
  memoryType: 'consultation_detail',
  schemaVersion: 'memory-v1',
  contentJsonb: Object.freeze({ value: 'owner-active' }),
  createdByCharacterId: 'memory-list-alpha',
  createdAt: '2026-08-20T00:00:00.000Z',
});

class FakeMemoryItemsReadAuthorityPortV1
  implements MemoryItemsReadAuthorityPortV1 {
  readonly calls: Array<{ subjectId: string }> = [];
  result: readonly MemoryItemCurrentAuthorityRowV1[] | Error = Object.freeze([
    PRIVATE_MEMORY,
    CHARACTER_MEMORY,
  ]);

  readCurrentItems(input: {
    readonly subjectId: string;
  }): readonly MemoryItemCurrentAuthorityRowV1[] {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

async function expectApiCode(
  promise: Promise<unknown>,
  code: string,
): Promise<ApiCommandError> {
  try {
    await promise;
    throw new Error('Expected ApiCommandError.');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiCommandError);
    expect((error as ApiCommandError).code).toBe(code);
    return error as ApiCommandError;
  }
}

describe('current Memory Item API authority boundary', () => {
  it('pins the read boundary to the verified owner current Memory Item query', () => {
    expect(MEMORY_ITEMS_READ_AUTHORITY_BINDING_V1)
      .toBe('public.qry_memory_items_v1');
  });

  it('passes only trusted resolved subject identity to authority', async () => {
    const port = new FakeMemoryItemsReadAuthorityPortV1();
    const result = await getMemoryItems({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    });

    expect(port.calls).toEqual([{ subjectId: SUBJECT_ID }]);
    expect(result.memories).toEqual([
      {
        memoryItemId: PRIVATE_MEMORY_ID,
        memoryType: 'relationship_memory',
        schemaVersion: 'memory-v1',
        contentJsonb: { value: 'owner-private' },
        createdByCharacterId: null,
        createdAt: '2026-08-22T00:00:00.000Z',
      },
      {
        memoryItemId: CHARACTER_MEMORY_ID,
        memoryType: 'consultation_detail',
        schemaVersion: 'memory-v1',
        contentJsonb: { value: 'owner-active' },
        createdByCharacterId: 'memory-list-alpha',
        createdAt: '2026-08-20T00:00:00.000Z',
      },
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.memories)).toBe(true);
    expect(result.memories.every((item) => Object.isFrozen(item))).toBe(true);
  });

  it('keeps private zero-grant Memory owner-visible without inventing grant state', async () => {
    const port = new FakeMemoryItemsReadAuthorityPortV1();
    const result = await getMemoryItems({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    });

    expect(result.memories[0]).toMatchObject({
      memoryItemId: PRIVATE_MEMORY_ID,
      createdByCharacterId: null,
    });
    expect(result.memories[0]).not.toHaveProperty('grants');
    expect(result.memories[0]).not.toHaveProperty('visibility');
    expect(result.memories[0]).not.toHaveProperty('sharedWithCharacters');
  });

  it('preserves unknown-but-stored memory type/schema/content while SRC-25 remains open', async () => {
    const port = new FakeMemoryItemsReadAuthorityPortV1();
    port.result = Object.freeze([
      Object.freeze({
        ...PRIVATE_MEMORY,
        memoryType: 'stored_future_memory_type',
        schemaVersion: 'stored-memory-v77',
        contentJsonb: Object.freeze({ nested: ['opaque', 7], enabled: true }),
      }),
    ]);

    const result = await getMemoryItems({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    });
    expect(result.memories[0]).toMatchObject({
      memoryType: 'stored_future_memory_type',
      schemaVersion: 'stored-memory-v77',
      contentJsonb: { nested: ['opaque', 7], enabled: true },
    });
  });

  it('drops internal provenance, revocation history, proposal state, and grant authority extras', async () => {
    const port = new FakeMemoryItemsReadAuthorityPortV1();
    port.result = Object.freeze([
      {
        ...PRIVATE_MEMORY,
        subjectId: 'must-not-leak',
        sourceKind: 'must-not-leak',
        sourceTurnId: 'must-not-leak',
        sourceMessageId: 'must-not-leak',
        sourceMergeActionId: 'must-not-leak',
        revokedAt: 'must-not-leak',
        memoryProposalId: 'must-not-leak',
        grants: ['must-not-leak'],
      } as MemoryItemCurrentAuthorityRowV1,
    ]);

    const serialized = JSON.stringify(await getMemoryItems({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    }));

    expect(serialized).not.toContain('subjectId');
    expect(serialized).not.toContain('sourceKind');
    expect(serialized).not.toContain('sourceTurnId');
    expect(serialized).not.toContain('sourceMessageId');
    expect(serialized).not.toContain('sourceMergeActionId');
    expect(serialized).not.toContain('revokedAt');
    expect(serialized).not.toContain('memoryProposalId');
    expect(serialized).not.toContain('grants');
    expect(serialized).not.toContain('must-not-leak');
  });

  it('allows an empty current Memory list', async () => {
    const port = new FakeMemoryItemsReadAuthorityPortV1();
    port.result = Object.freeze([]);

    await expect(getMemoryItems({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    })).resolves.toEqual({ memories: [] });
  });

  it('requires trusted resolved subject identity before DB authority', async () => {
    const missingPort = new FakeMemoryItemsReadAuthorityPortV1();
    await expectApiCode(
      getMemoryItems({ authorityPort: missingPort }),
      'AUTH_REQUIRED',
    );
    expect(missingPort.calls).toHaveLength(0);

    const blankPort = new FakeMemoryItemsReadAuthorityPortV1();
    await expectApiCode(
      getMemoryItems({ resolvedSubjectId: '   ', authorityPort: blankPort }),
      'AUTH_REQUIRED',
    );
    expect(blankPort.calls).toHaveLength(0);
  });

  it('maps ineligible merged/deletion-pending/deleted subject reads to bounded NOT_FOUND', async () => {
    const port = new FakeMemoryItemsReadAuthorityPortV1();
    port.result = new MemoryItemsReadAuthorityPortErrorV1(
      'SUBJECT_INELIGIBLE',
      'raw subject state must stay hidden',
    );

    const error = await expectApiCode(
      getMemoryItems({ resolvedSubjectId: SUBJECT_ID, authorityPort: port }),
      'NOT_FOUND',
    );
    expect(error.message).toBe('Memories are unavailable for the current subject.');
  });

  it('maps authority input rejection to INVALID_REQUEST and rethrows infrastructure failures', async () => {
    const invalidPort = new FakeMemoryItemsReadAuthorityPortV1();
    invalidPort.result = new MemoryItemsReadAuthorityPortErrorV1(
      'INVALID_INPUT',
      'memory list subject is required',
    );
    await expectApiCode(
      getMemoryItems({ resolvedSubjectId: SUBJECT_ID, authorityPort: invalidPort }),
      'INVALID_REQUEST',
    );

    const infraPort = new FakeMemoryItemsReadAuthorityPortV1();
    const failure = new Error('database transport unavailable');
    infraPort.result = failure;
    await expect(getMemoryItems({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: infraPort,
    })).rejects.toBe(failure);
  });

  it('fails closed on duplicate identities and non-deterministic current ordering', async () => {
    const port = new FakeMemoryItemsReadAuthorityPortV1();
    port.result = Object.freeze([
      PRIVATE_MEMORY,
      Object.freeze({ ...CHARACTER_MEMORY, memoryItemId: PRIVATE_MEMORY_ID }),
    ]);
    await expect(getMemoryItems({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    })).rejects.toThrow('duplicate Memory Item identity');

    port.result = Object.freeze([CHARACTER_MEMORY, PRIVATE_MEMORY]);
    await expect(getMemoryItems({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    })).rejects.toThrow('non-deterministic item order');
  });

  it('fails closed when equal timestamps are not ordered by descending Memory Item id', async () => {
    const port = new FakeMemoryItemsReadAuthorityPortV1();
    port.result = Object.freeze([
      Object.freeze({
        ...PRIVATE_MEMORY,
        memoryItemId: '93000000-0000-0000-0000-000000000101',
        createdAt: '2026-08-22T00:00:00.000Z',
      }),
      Object.freeze({
        ...CHARACTER_MEMORY,
        memoryItemId: '93000000-0000-0000-0000-000000000202',
        createdAt: '2026-08-22T00:00:00.000Z',
      }),
    ]);

    await expect(getMemoryItems({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    })).rejects.toThrow('non-deterministic item order');
  });

  it('fails closed on malformed identity, type/schema, creator, timestamp, or content', async () => {
    const port = new FakeMemoryItemsReadAuthorityPortV1();

    port.result = Object.freeze([Object.freeze({ ...PRIVATE_MEMORY, memoryType: '' })]);
    await expect(getMemoryItems({ resolvedSubjectId: SUBJECT_ID, authorityPort: port }))
      .rejects.toThrow('invalid memory type');

    port.result = Object.freeze([Object.freeze({ ...PRIVATE_MEMORY, createdAt: 'not-a-time' })]);
    await expect(getMemoryItems({ resolvedSubjectId: SUBJECT_ID, authorityPort: port }))
      .rejects.toThrow('invalid created timestamp');

    port.result = Object.freeze([
      Object.freeze({ ...PRIVATE_MEMORY, createdByCharacterId: '' }),
    ]);
    await expect(getMemoryItems({ resolvedSubjectId: SUBJECT_ID, authorityPort: port }))
      .rejects.toThrow('invalid creator character identity');

    port.result = Object.freeze([Object.freeze({ ...PRIVATE_MEMORY, contentJsonb: undefined })]);
    await expect(getMemoryItems({ resolvedSubjectId: SUBJECT_ID, authorityPort: port }))
      .rejects.toThrow('undefined content payload');
  });
});
