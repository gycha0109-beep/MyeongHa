import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../packages/domain/src/index.js';
import {
  selectSeyeonRuntimeRetrievedMemoriesV2,
  type SeyeonRetrievedMemoryV2,
} from '../packages/domain/src/seyeon-runtime-context-v2.js';
import {
  selectSeyeonExactModelPersonalSourcesV1,
  SeyeonExactModelPersonalSourceSelectionHoldV1,
} from '../apps/api/src/seyeon-exact-model-personal-source-selection-v1.js';
import type {
  SeyeonPersonalRecordProjectionCandidateV1,
} from '../apps/api/src/seyeon-production-context-v1.js';

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const GRANT1 = '33333333-3333-4333-8333-333333333333';
const GRANT2 = '44444444-4444-4444-8444-444444444444';
const DIGEST1 = 'sha256:v1:' + '1'.repeat(64);
const DIGEST2 = 'sha256:v1:' + '2'.repeat(64);

const hash = (value: unknown) => 'sha256:v1:' +
  createHash('sha256').update(canonicalJson(value)).digest('hex');

const event: SeyeonRetrievedMemoryV2 = {
  kind: 'relationship_event', memoryId: 'relationship-event:public',
  claimKind: 'fact', summary: 'shared event', sourceRef: 'relationship-event:public',
  relevance: 1, salience: 1, causalAuthority: 'authorized_shared_history',
};

function personal(id: string, grant: string, relevance: number): SeyeonRetrievedMemoryV2 {
  return {
    kind: 'memory', memoryId: 'memory:' + id,
    claimKind: 'fact', summary: 'synthetic summary', sourceRef:
      'memory:' + id + ':grant:' + grant,
    relevance, salience: .5,
  };
}
function candidate(m: SeyeonRetrievedMemoryV2, rawRecordDigest: string): SeyeonPersonalRecordProjectionCandidateV1 {
  const parts = m.sourceRef.split(':');
  return {
    recordKind: 'memory', recordId: parts[1]!,
    grantId: parts[3]!, recordType: 'synthetic',
    schemaVersion: 'v1', projectedMemoryId: m.memoryId,
    rawRecordDigest, projectedMemoryDigest: hash(m),
    permitsAtomicCommit: false, permitsHttpReveal: false,
  };
}
const m1 = personal(ID1, GRANT1, .8);
const m2 = personal(ID2, GRANT2, .6);
const c1 = candidate(m1, DIGEST1);
const c2 = candidate(m2, DIGEST2);
const select = (input: {
  readonly memories?: readonly SeyeonRetrievedMemoryV2[];
  readonly candidates?: readonly SeyeonPersonalRecordProjectionCandidateV1[];
  readonly limit?: number;
} = {}) => selectSeyeonExactModelPersonalSourcesV1({
  retrievedMemories: input.memories ?? [event, m2, m1],
  sourceCandidates: input.candidates ?? [c1, c2],
  ...(input.limit === undefined ? {} : { maxRetrievedMemories: input.limit }),
});

describe('G1-B exact personal record runtime source selection, no DB authorization', () => {
  it('uses the identical normalized rank and cap as runtime and excludes preselected but dropped inputs', () => {
    const result = select({ limit: 2 });
    const actual = selectSeyeonRuntimeRetrievedMemoriesV2({
      retrievedMemories: [event, m2, m1], maxRetrievedMemories: 2,
    });
    expect(actual.map(x => x.memoryId)).toEqual([event.memoryId, m1.memoryId]);
    expect(result).toMatchObject({
      version: 'seyeon-exact-model-personal-source-selection-v1',
      selectedMemoryCount: 2,
      selectedPersonalRecordCount: 1,
      selectedSources: [{
        recordKind: 'memory', recordId: ID1, grantId: GRANT1,
        recordType: 'synthetic', schemaVersion: 'v1',
        rawRecordDigest: DIGEST1,
        projectedMemoryDigest: hash(m1),
      }],
      selectedSourcesDigest: hash([{
        recordKind: 'memory', recordId: ID1, grantId: GRANT1,
        recordType: 'synthetic', schemaVersion: 'v1',
        rawRecordDigest: DIGEST1,
        projectedMemoryDigest: hash(m1),
      }]),
      persistedBeforeModel: false,
      permitsAtomicCommit: false,
      permitsHttpReveal: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.selectedSources)).toBe(true);
    expect(result.selectedSources.some(x=> x.recordId === ID2)).toBe(false);
  });

  it('selects relationship-only and preserves explicit zero personal even when candidates exist', () => {
    const r = select({ limit: 1 });
    expect(r.selectedMemoryCount).toBe(1);
    expect(r.selectedSources).toEqual([]);
    expect(r.selectedSourcesDigest).toBe(hash([]));
    const noPersonal = select({ memories: [event], candidates: [] });
    expect(noPersonal.selectedSources).toEqual([]);
  });

  it('fails closed for missing candidate, forged grant, changed projections, duplicate identities, and invalid digests', () => {
    const invalidCases: readonly (readonly SeyeonPersonalRecordProjectionCandidateV1[])[] = [
      [c1], // m2 exists in the source but has no corresponding authorized candidate
      [{ ...c1, grantId: GRANT2 }, c2],
      [{ ...c1, projectedMemoryDigest: DIGEST2 }, c2],
      [{ ...c1, rawRecordDigest: 'sha256:v1:bad' }, c2],
      [c1, c1],
      [c1, { ...c2, permitsHttpReveal: true } as unknown as SeyeonPersonalRecordProjectionCandidateV1],
    ];
    for (const candidates of invalidCases) {
      expect(() => select({ candidates })).toThrow(SeyeonExactModelPersonalSourceSelectionHoldV1);
    }
    expect(() => select({ memories: [event, m1, m1] })).toThrow();
    expect(() => select({ memories: [event, { ...m1, sourceRef: 'memory:spoofed:grant:' + GRANT1 }, m2] }))
      .toThrow();
    expect(() => select({ memories: [event, { ...m1, summary: 'forged text' }, m2] }))
      .toThrow();
  });

  it('cannot treat undefined candidate evidence as zero when personal memory is present', () => {
    const input = { retrievedMemories: [m1], sourceCandidates: undefined };
    expect(() => selectSeyeonExactModelPersonalSourcesV1(
      input as unknown as Parameters<typeof selectSeyeonExactModelPersonalSourcesV1>[0],
    )).toThrow(SeyeonExactModelPersonalSourceSelectionHoldV1);
  });

  it('is checked before the governed preflight/model call; actual positive uses remain blocked', async () => {
    const runtime = await readFile(
      new URL('../apps/api/src/seyeon-production-chat-execution-v1.ts', import.meta.url),
      'utf8',
    );
    const interlock = runtime.indexOf('assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1(');
    const exact = runtime.indexOf('const exactModelPersonalSources = selectSeyeonExactModelPersonalSourcesV1({');
    const governance = runtime.indexOf('const governance = await resolveTurnGovernance({');
    const provider = runtime.indexOf('const runtime = await runSeyeonCharacterTurnV2({');
    expect(exact).toBeGreaterThan(interlock);
    expect(governance).toBeGreaterThan(exact);
    expect(provider).toBeGreaterThan(governance);
    const assembler = await readFile(
      new URL('../packages/domain/src/seyeon-runtime-context-v2.ts', import.meta.url),
      'utf8',
    );
    expect(assembler).toContain('const retrievedMemories = selectSeyeonRuntimeRetrievedMemoriesV2({');
  });
});
