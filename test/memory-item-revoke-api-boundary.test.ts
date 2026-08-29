import { describe, expect, it } from 'vitest';
import {
  ApiCommandError,
  MEMORY_ITEM_REVOKE_COMMAND_AUTHORITY_BINDING_V1,
  MemoryItemRevokeCommandAuthorityPortErrorV1,
  revokeMemoryItem,
  type MemoryItemRevokeCommandAuthorityPortV1,
  type MemoryItemRevokeCommandAuthorityRowV1,
} from '../apps/api/src/index.js';

const SUBJECT_ID = '95000000-0000-0000-0000-000000000001';
const MEMORY_ID = '95000000-0000-0000-0000-000000000101';
const REVOKED_AT = '2026-08-30T01:02:03.000Z';

const SUCCESS_ROW: MemoryItemRevokeCommandAuthorityRowV1 = Object.freeze({
  memoryItemId: MEMORY_ID,
  revokedAt: REVOKED_AT,
  replayed: false,
});

class FakeMemoryItemRevokeCommandAuthorityPortV1
  implements MemoryItemRevokeCommandAuthorityPortV1 {
  readonly calls: Array<{ subjectId: string; memoryItemId: string }> = [];
  result: readonly MemoryItemRevokeCommandAuthorityRowV1[] | Error = Object.freeze([
    SUCCESS_ROW,
  ]);

  revokeMemoryItem(input: {
    readonly subjectId: string;
    readonly memoryItemId: string;
  }): readonly MemoryItemRevokeCommandAuthorityRowV1[] {
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

describe('Memory Item revoke API authority boundary', () => {
  it('pins DELETE /api/memories/:id to the verified Memory revoke command', () => {
    expect(MEMORY_ITEM_REVOKE_COMMAND_AUTHORITY_BINDING_V1)
      .toBe('public.cmd_revoke_memory_item_v1');
  });

  it('passes only trusted resolved subject and route Memory identity to authority', async () => {
    const port = new FakeMemoryItemRevokeCommandAuthorityPortV1();
    const result = await revokeMemoryItem({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      authorityPort: port,
    });

    expect(port.calls).toEqual([{ subjectId: SUBJECT_ID, memoryItemId: MEMORY_ID }]);
    expect(result).toEqual({
      memoryItemId: MEMORY_ID,
      revokedAt: REVOKED_AT,
      replayed: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('preserves authoritative replay of the original revocation timestamp', async () => {
    const port = new FakeMemoryItemRevokeCommandAuthorityPortV1();
    port.result = Object.freeze([
      Object.freeze({ ...SUCCESS_ROW, replayed: true }),
    ]);

    await expect(revokeMemoryItem({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      authorityPort: port,
    })).resolves.toEqual({
      memoryItemId: MEMORY_ID,
      revokedAt: REVOKED_AT,
      replayed: true,
    });
  });

  it('does not pretend revoke hard-deletes content/provenance/grants or revokes character access rows', async () => {
    const port = new FakeMemoryItemRevokeCommandAuthorityPortV1();
    port.result = Object.freeze([
      {
        ...SUCCESS_ROW,
        hardDeleted: true,
        contentJsonb: { secret: 'must-not-leak' },
        sourceKind: 'must-not-leak',
        sourceMessageId: 'must-not-leak',
        grantsRevoked: true,
        revokedGrantIds: ['must-not-leak'],
      } as MemoryItemRevokeCommandAuthorityRowV1,
    ]);

    const serialized = JSON.stringify(await revokeMemoryItem({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      authorityPort: port,
    }));

    expect(serialized).not.toContain('hardDeleted');
    expect(serialized).not.toContain('contentJsonb');
    expect(serialized).not.toContain('sourceKind');
    expect(serialized).not.toContain('sourceMessageId');
    expect(serialized).not.toContain('grantsRevoked');
    expect(serialized).not.toContain('revokedGrantIds');
    expect(serialized).not.toContain('must-not-leak');
  });

  it('requires trusted subject and a nonblank route Memory identity before DB authority', async () => {
    const missingSubjectPort = new FakeMemoryItemRevokeCommandAuthorityPortV1();
    await expectApiCode(
      revokeMemoryItem({ memoryItemId: MEMORY_ID, authorityPort: missingSubjectPort }),
      'AUTH_REQUIRED',
    );
    expect(missingSubjectPort.calls).toHaveLength(0);

    const invalidMemoryPort = new FakeMemoryItemRevokeCommandAuthorityPortV1();
    await expectApiCode(
      revokeMemoryItem({
        resolvedSubjectId: SUBJECT_ID,
        memoryItemId: '   ',
        authorityPort: invalidMemoryPort,
      }),
      'INVALID_REQUEST',
    );
    expect(invalidMemoryPort.calls).toHaveLength(0);
  });

  it('maps ineligible subject and cross-owner/unknown Memory probes to the same bounded NOT_FOUND', async () => {
    for (const code of ['SUBJECT_INELIGIBLE', 'MEMORY_UNAVAILABLE'] as const) {
      const port = new FakeMemoryItemRevokeCommandAuthorityPortV1();
      port.result = new MemoryItemRevokeCommandAuthorityPortErrorV1(
        code,
        'raw authority detail must stay hidden',
      );

      const error = await expectApiCode(
        revokeMemoryItem({
          resolvedSubjectId: SUBJECT_ID,
          memoryItemId: MEMORY_ID,
          authorityPort: port,
        }),
        'NOT_FOUND',
      );
      expect(error.message).toBe('Memory is unavailable for the current subject.');
      expect(error.message).not.toContain('raw authority detail');
    }
  });

  it('maps authority input rejection to INVALID_REQUEST and rethrows infrastructure failures', async () => {
    const invalidPort = new FakeMemoryItemRevokeCommandAuthorityPortV1();
    invalidPort.result = new MemoryItemRevokeCommandAuthorityPortErrorV1(
      'INVALID_INPUT',
      'memory item id is required',
    );
    await expectApiCode(
      revokeMemoryItem({
        resolvedSubjectId: SUBJECT_ID,
        memoryItemId: MEMORY_ID,
        authorityPort: invalidPort,
      }),
      'INVALID_REQUEST',
    );

    const infraPort = new FakeMemoryItemRevokeCommandAuthorityPortV1();
    const failure = new Error('database transport unavailable');
    infraPort.result = failure;
    await expect(revokeMemoryItem({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      authorityPort: infraPort,
    })).rejects.toBe(failure);
  });

  it('fails closed unless authority returns exactly one successful row', async () => {
    const port = new FakeMemoryItemRevokeCommandAuthorityPortV1();
    port.result = Object.freeze([]);
    await expect(revokeMemoryItem({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      authorityPort: port,
    })).rejects.toThrow('exactly one successful row');

    port.result = Object.freeze([SUCCESS_ROW, SUCCESS_ROW]);
    await expect(revokeMemoryItem({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      authorityPort: port,
    })).rejects.toThrow('exactly one successful row');
  });

  it('fails closed on mismatched Memory identity, invalid timestamp, or invalid replay marker', async () => {
    const port = new FakeMemoryItemRevokeCommandAuthorityPortV1();

    port.result = Object.freeze([
      Object.freeze({ ...SUCCESS_ROW, memoryItemId: '95000000-0000-0000-0000-000000000999' }),
    ]);
    await expect(revokeMemoryItem({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      authorityPort: port,
    })).rejects.toThrow('different Memory identity');

    port.result = Object.freeze([
      Object.freeze({ ...SUCCESS_ROW, revokedAt: 'not-a-time' }),
    ]);
    await expect(revokeMemoryItem({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      authorityPort: port,
    })).rejects.toThrow('invalid revokedAt timestamp');

    port.result = Object.freeze([
      { ...SUCCESS_ROW, replayed: 'yes' } as unknown as MemoryItemRevokeCommandAuthorityRowV1,
    ]);
    await expect(revokeMemoryItem({
      resolvedSubjectId: SUBJECT_ID,
      memoryItemId: MEMORY_ID,
      authorityPort: port,
    })).rejects.toThrow('invalid replay marker');
  });
});
