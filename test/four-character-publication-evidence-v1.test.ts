import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  FOUR_CHARACTER_PUBLISHED_ARTIFACT_DB_BINDING_V1,
  FourCharacterPublishedArtifactUnavailableV1,
  createPostgresFourCharacterPublishedArtifactEvidencePortV1,
  createScopedFourCharacterPublishedArtifactEvidencePortV1,
} from '../apps/api/src/postgres-four-character-publication-evidence-v1.js';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';
import type { SeyeonProductionSubjectTransactionRunnerV1 } from '../apps/api/src/seyeon-production-subject-transaction-v1.js';

const source = readFileSync(new URL(
  '../scripts/operations/character-chat/production-02-four-character-published-artifact-read-20261106.sql',
  import.meta.url,
), 'utf8');
const subjectId = '11111111-1111-4111-8111-111111111111';
const threadId = '22222222-2222-4222-8222-222222222222';
const releaseId = '33333333-3333-4333-8333-333333333333';
const bundleId = '44444444-4444-4444-8444-444444444444';
const hash = 'sha256:v1:' + 'a'.repeat(64);
const request = Object.freeze({
  subjectId, threadId, characterId: 'baekheon' as const, releaseId, bundleId,
});
const row = Object.freeze({
  characterId: 'baekheon',
  releaseId, bundleId,
  contentVersion: 'baekheon-published-v1',
  contentHash: hash,
  artifactRef: 'docs/character/baekheon-publication-v1.json',
  artifactSchemaVersion: 'character-publication-v1',
  minClientCapability: 'character-chat-theme-v1',
  assetManifestHash: 'sha256:v1:' + 'b'.repeat(64),
  cueSchemaVersion: 'character-static-presentation-v1',
});

function fakeDb(rows: readonly Readonly<Record<string, unknown>>[] = [row]) {
  const sqlCalls: { text: string; values?: readonly unknown[] }[] = [];
  const query: PostgresTransactionQueryV1['query'] = async <T>(
    text: string,
    values?: readonly unknown[],
  ) => {
    sqlCalls.push(values === undefined ? { text } : { text, values });
    return { rows: rows as unknown as T[] };
  };
  return { client: { query } satisfies PostgresTransactionQueryV1, sqlCalls };
}

describe('four published Character DB artifact authority', () => {
  it('only reads the Member-owned exact release/bundle through one parameterized RPC', async () => {
    const db = fakeDb();
    const port = createPostgresFourCharacterPublishedArtifactEvidencePortV1(db.client);
    const result = await port.readPublishedArtifact(request);
    expect(result).toEqual(row);
    expect(db.sqlCalls).toHaveLength(1);
    expect(db.sqlCalls[0]?.text).toContain(FOUR_CHARACTER_PUBLISHED_ARTIFACT_DB_BINDING_V1);
    expect(db.sqlCalls[0]?.text).toContain('$1::uuid, $2::uuid, $3::text, $4::uuid, $5::uuid');
    expect(db.sqlCalls[0]?.values).toEqual([
      subjectId, threadId, 'baekheon', releaseId, bundleId,
    ]);
  });

  it('rejects Yunho and Se-yeon before any DB access', async () => {
    const db = fakeDb();
    const port = createPostgresFourCharacterPublishedArtifactEvidencePortV1(db.client);
    for (const id of ['seyeon','yunho']) {
      await expect(port.readPublishedArtifact({
        ...request, characterId: id as never,
      })).rejects.toThrow(FourCharacterPublishedArtifactUnavailableV1);
    }
    expect(db.sqlCalls).toHaveLength(0);
  });

  it('rejects zero, duplicate, wrong Character and wrong Pin responses', async () => {
    const cases = [
      [], [row,row],
      [{ ...row, characterId: 'yeoul' }],
      [{ ...row, releaseId: '55555555-5555-4555-8555-555555555555' }],
      [{ ...row, bundleId: '66666666-6666-4666-8666-666666666666' }],
    ];
    for (const rows of cases) {
      const port = createPostgresFourCharacterPublishedArtifactEvidencePortV1(fakeDb(rows).client);
      await expect(port.readPublishedArtifact(request))
        .rejects.toThrow(FourCharacterPublishedArtifactUnavailableV1);
    }
  });

  it('rejects forged artifact paths, invalid hashes and missing metadata', async () => {
    const tampered = [
      { ...row, artifactRef: 'https://example.com/other.json' },
      { ...row, artifactRef: 'docs/character/../seyeon.json' },
      { ...row, artifactRef: 'docs/character/character.sql' },
      { ...row, contentHash: 'sha256:unverified' },
      { ...row, artifactSchemaVersion: '' },
    ];
    for (const bad of tampered) {
      const port = createPostgresFourCharacterPublishedArtifactEvidencePortV1(fakeDb([bad]).client);
      await expect(port.readPublishedArtifact(request))
        .rejects.toThrow(FourCharacterPublishedArtifactUnavailableV1);
    }
  });

  it('converts DB/ACL failures to an opaque missing-source verdict', async () => {
    const port = createPostgresFourCharacterPublishedArtifactEvidencePortV1({
      async query() {
        throw Object.assign(new Error('table permission detail must remain private'), {
          code: '42501',
        });
      },
    });
    await expect(port.readPublishedArtifact(request)).rejects.toThrow(
      'Independent Character published artifact is unavailable.',
    );
  });

  it('binds each lookup to the same canonical Subject runner', async () => {
    const db = fakeDb();
    const runner = {
      resolveSubject: vi.fn(async () => ({ subjectId, subjectKind: 'member' as const })),
      run: vi.fn(async (_subjectId: string, execute: (
        client: PostgresTransactionQueryV1,
        subject: { subjectId: string; subjectKind: 'member' },
      ) => unknown) => execute(db.client, {
        subjectId, subjectKind: 'member' as const,
      })),
    } as unknown as SeyeonProductionSubjectTransactionRunnerV1;
    const scoped = createScopedFourCharacterPublishedArtifactEvidencePortV1({
      subjectId, runner,
    });
    const evidence = await scoped.readPublishedArtifact(request);
    expect(evidence.characterId).toBe('baekheon');
    expect(runner.run).toHaveBeenCalledWith(subjectId, expect.any(Function));
    await expect(scoped.readPublishedArtifact({
      ...request, subjectId: '77777777-7777-4777-8777-777777777777',
    })).rejects.toThrow(FourCharacterPublishedArtifactUnavailableV1);
    expect(runner.run).toHaveBeenCalledOnce();
  });

  it('ships an owner-only non-default release SQL operation without direct API table grants', () => {
    expect(source).toContain('security definer');
    expect(source).toContain('to myeongha_chat_thread_open_owner');
    expect(source).toContain('owner to myeongha_chat_thread_open_owner');
    expect(source).toContain('to myeongha_api_executor');
    expect(source).toContain('perform public.assert_myeongha_subject_context_v1(p_subject_id)');
    expect(source).toContain("s.kind = 'member'");
    expect(source).toContain("s.status = 'active'");
    expect(source).toContain("cr.is_default = false");
    expect(source).toContain("cr.status = 'active'");
    expect(source).toContain('cr.retired_at is null');
    expect(source).toContain('cb.retired_at is null');
    expect(source).toContain("crc.availability = 'available'");
    expect(source).toContain('crc.enabled = true');
    expect(source).toContain("ct.thread_type = 'single_character'");
    expect(source).toContain('ct.subject_id = p_subject_id');
    expect(source).toContain('other.left_at is null');
    expect(source).toContain("p_character_id not in ('baekheon', 'yeoul', 'rahyeon', 'taegyeom')");
    expect(source).not.toMatch(/grant\s+(?:insert|update|delete|all)\s+on\s+public\./iu);
  });
});
