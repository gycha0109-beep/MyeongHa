import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '../packages/domain/src/index.js';
import type { SeyeonRetrievedMemoryV2 } from '../packages/domain/src/seyeon-runtime-context-v2.js';
import {
  admitSeyeonOfflineS0ContextCandidateV1,
  runSeyeonOfflineS0ScopedTurnV1,
  type SeyeonOfflineS0ContextCandidateV1,
} from '../apps/api/src/seyeon-offline-s0-context-admission-v1.js';
import {
  selectSeyeonExactModelPersonalSourcesV1,
} from '../apps/api/src/seyeon-exact-model-personal-source-selection-v1.js';
import type {
  SeyeonOfflineGrantedTurnAuthorityV1,
} from '../apps/api/src/seyeon-offline-granted-turn-v1.js';

const SUBJECT = '11111111-1111-4111-8111-111111111111';
const THREAD = '22222222-2222-4222-8222-222222222222';
const TURN = '33333333-3333-4333-8333-333333333333';
const ATTEMPT = '44444444-4444-4444-8444-444444444444';
const CURRENT_MESSAGE = '55555555-5555-4555-8555-555555555555';
const MEMORY = '66666666-6666-4666-8666-666666666666';
const GRANT = '77777777-7777-4777-8777-777777777777';
const digest = (data: unknown) =>
  'sha256:v1:' + createHash('sha256')
    .update(canonicalJson(data)).digest('hex');

const identity = Object.freeze({
  subjectId: SUBJECT, threadId: THREAD, turnId: TURN,
  attemptId: ATTEMPT, characterId: 'seyeon' as const,
});
const message = Object.freeze({
  messageId: CURRENT_MESSAGE,
  text: '합성 입력: 세연과 이 대화를 시작합니다.',
});
const memory: SeyeonRetrievedMemoryV2 = Object.freeze({
  kind: 'memory', memoryId: 'memory:' + MEMORY,
  claimKind: 'fact', summary: '합성 사용자 승인 기억',
  sourceRef: 'memory:' + MEMORY + ':grant:' + GRANT,
  relevance: 0.7, salience: 0.5,
});
const sourceCandidate = Object.freeze({
  recordKind: 'memory' as const, recordId: MEMORY, grantId: GRANT,
  recordType: 'synthetic-s0-only', schemaVersion: 'synthetic-v1',
  projectedMemoryId: memory.memoryId,
  rawRecordDigest: digest({ origin: 'synthetic-db-only' }),
  projectedMemoryDigest: digest(memory),
  permitsAtomicCommit: false as const,
  permitsHttpReveal: false as const,
});

function validFixture(): SeyeonOfflineS0ContextCandidateV1 {
  const records = [memory];
  const candidates = [sourceCandidate];
  return {
    identity,
    currentUserMessage: message,
    productionContext: {
      version: 'seyeon-production-context-v1',
      relationshipRevisionUsedForTurn: null,
      historyThroughRevision: 0,
      recentMessages: [],
      retrievedMemories: records,
      personalRecordAdmissions: [{
        recordKind: 'memory', recordId: MEMORY,
        recordType: 'synthetic-s0-only',
        schemaVersion: 'synthetic-v1', reason: 'ADMITTED',
      }],
      personalRecordProjectionCandidates: candidates,
      activeRelationshipEventCount: 0,
      relationshipHistoryRecords: [],
    },
    finalContext: {
      relationship: null,
      recentMessages: [{ ...message, role: 'user' }],
      retrievedMemories: records,
    },
    selection: selectSeyeonExactModelPersonalSourcesV1({
      retrievedMemories: records,
      sourceCandidates: candidates,
    }),
    syntheticApprovedSchema: {
      recordType: 'synthetic-s0-only',
      schemaVersion: 'synthetic-v1',
    },
    simulatedOtherIngress: {
      preflight: [], reader: [], disclosure: [], peer: [], external: [],
    },
  };
}

function syntheticAuthority() {
  const calls: string[] = [];
  let grantActive = true;
  const authority: SeyeonOfflineGrantedTurnAuthorityV1 = {
    async pinBeforeModel({ identity: scope, selection }) {
      calls.push('pin');
      if (scope.attemptId !== ATTEMPT ||
          selection.selectedSources[0]?.grantId !== GRANT) {
        throw new Error('wrong subject or original grant');
      }
      return {
        attemptId: scope.attemptId,
        selectedSourcesDigest: selection.selectedSourcesDigest,
        pinRef: 'offline-db-owner-fixture',
      };
    },
    async commitWithGrantRecheck({ identity: scope, pin }) {
      calls.push('commit');
      if (!grantActive) throw new Error('revoked original Grant');
      return {
        attemptId: scope.attemptId,
        pinRef: pin.pinRef, commitRef: 'synthetic-commit',
      };
    },
    async revealCommitted() {
      calls.push('reveal');
      return grantActive ? 'SYNTHETIC_ALLOWED' : null;
    },
    async replayWithCurrentGrantRecheck() {
      calls.push('replay');
      return grantActive ? 'SYNTHETIC_ALLOWED' : null;
    },
  };
  return {
    authority, calls,
    revoke: () => { grantActive = false; },
  };
}

async function attempt(candidate: SeyeonOfflineS0ContextCandidateV1) {
  const f = syntheticAuthority();
  const generateSyntheticText = vi.fn(async () => {
    f.calls.push('model');
    return 'SYNTHETIC_ALLOWED';
  });
  const result = await runSeyeonOfflineS0ScopedTurnV1({
    identity, candidate, selection: candidate.selection,
    authority: f.authority, generateSyntheticText,
  });
  return { result, f, generateSyntheticText };
}

describe('G0 S0 source closure synthetic candidate — NO DB/production authorization', () => {
  it('accepts exactly one server-shaped direct Memory with no historical or external source', async () => {
    const candidate = validFixture();
    const admission = admitSeyeonOfflineS0ContextCandidateV1(candidate);
    expect(admission).toEqual({
      state: 'eligible_offline_synthetic_only',
      candidateDigest: expect.stringMatching(/^sha256:v1:[a-f0-9]{64}$/),
      permitsProductionProvider: false,
      permitsProductionReveal: false,
    });
    const { result, f } = await attempt(candidate);
    expect(result).toEqual({ state: 'revealed', text: 'SYNTHETIC_ALLOWED' });
    expect(f.calls).toEqual(['pin', 'model', 'commit', 'reveal']);
  });

  it.each(['user', 'assistant'] as const)(
    'rejects historical %s message even though direct positive Grant exists',
    async (role) => {
      const candidate = validFixture();
      const injected = {
        ...candidate,
        productionContext: {
          ...candidate.productionContext,
          recentMessages: [{
            messageId: '88888888-8888-4888-8888-888888888888',
            role, text: 'UNATTRIBUTED_HISTORICAL_SECRET',
          }],
        },
      };
      const { result, f, generateSyntheticText } = await attempt(injected);
      expect(result).toEqual({ state: 'held' });
      expect(f.calls).toEqual([]);
      expect(generateSyntheticText).not.toHaveBeenCalled();
    },
  );

  it('rejects actual relationship events/state, including events lost to final model cap', async () => {
    for (const mutation of [
      (f: SeyeonOfflineS0ContextCandidateV1) => ({
        ...f,
        productionContext: { ...f.productionContext,
          relationshipHistoryRecords: [{ event: 'opaque' } as never] },
      }),
      (f: SeyeonOfflineS0ContextCandidateV1) => ({
        ...f,
        productionContext: { ...f.productionContext,
          activeRelationshipEventCount: 1 },
      }),
      (f: SeyeonOfflineS0ContextCandidateV1) => ({
        ...f,
        productionContext: { ...f.productionContext,
          historyThroughRevision: 2, relationshipRevisionUsedForTurn: 2 },
      }),
      (f: SeyeonOfflineS0ContextCandidateV1) => ({
        ...f,
        finalContext: { ...f.finalContext,
          relationship: { stageKey: 'friend' } as never },
      }),
      (f: SeyeonOfflineS0ContextCandidateV1) => ({
        ...f,
        productionContext: { ...f.productionContext,
          retrievedMemories: [...f.productionContext.retrievedMemories, {
            kind: 'relationship_event' as const, memoryId: 'relationship-event:e',
            claimKind: 'fact' as const, summary: 'UNATTRIBUTED_EVENT',
            sourceRef: 'relationship-event:e', relevance: 0, salience: 0,
          }] },
      }),
    ]) {
      const { result, generateSyntheticText, f } = await attempt(
        mutation(validFixture()),
      );
      expect(result).toEqual({ state: 'held' });
      expect(f.calls).toEqual([]);
      expect(generateSyntheticText).not.toHaveBeenCalled();
    }
  });

  it.each(['preflight', 'reader', 'disclosure', 'peer', 'external'] as const)(
    'rejects non-empty %s ingress before Pin and synthetic model',
    async (key) => {
      const f = validFixture();
      const candidate = {
        ...f,
        simulatedOtherIngress: {
          ...f.simulatedOtherIngress,
          [key]: ['UNATTRIBUTED_SOURCE'],
        },
      };
      const r = await attempt(candidate);
      expect(r.result).toEqual({ state: 'held' });
      expect(r.f.calls).toEqual([]);
    },
  );

  it('treats a missing ingress category as UNKNOWN (not empty zero)', async () => {
    const f = validFixture();
    const candidate = {
      ...f,
      simulatedOtherIngress: {
        preflight: [], reader: [], disclosure: [], peer: [],
      },
    } as unknown as SeyeonOfflineS0ContextCandidateV1;
    const r = await attempt(candidate);
    expect(r.result).toEqual({ state: 'held' });
    expect(r.f.calls).toEqual([]);
  });

  it('rejects a swapped Grant, projected content, missing selection and a second Memory', async () => {
    const source = validFixture();
    for (const altered of [
      { ...source, selection: {
        ...source.selection,
        selectedSources: [
          { ...source.selection.selectedSources[0]!, grantId: 'different-grant' },
        ],
      } },
      { ...source, finalContext: {
        ...source.finalContext, retrievedMemories: [{
          ...memory, summary: 'FORGED_SOURCE_PAYLOAD',
        }],
      } },
      { ...source, productionContext: {
        ...source.productionContext, personalRecordProjectionCandidates: [],
      } },
      { ...source, productionContext: {
        ...source.productionContext,
        retrievedMemories: [memory, memory],
      } },
      { ...source, syntheticApprovedSchema: {
        recordType: 'unauthorized-type', schemaVersion: 'v1',
      } },
      { ...source, selection: {
        ...source.selection, selectedSourcesDigest: 'sha256:v1:' + '0'.repeat(64),
      } },
    ]) {
      const r = await attempt(altered as SeyeonOfflineS0ContextCandidateV1);
      expect(r.result).toEqual({ state: 'held' });
      expect(r.generateSyntheticText).not.toHaveBeenCalled();
      expect(r.f.calls).toEqual([]);
    }
  });

  it('does not allow supplied candidate identity or selection to diverge from synthetic coordinator', async () => {
    const candidate = validFixture();
    const generateSyntheticText = vi.fn(async () => 'DO_NOT_RUN');
    const f = syntheticAuthority();
    const result = await runSeyeonOfflineS0ScopedTurnV1({
      identity: { ...identity, subjectId: 'OTHER_SUBJECT' },
      candidate,
      selection: candidate.selection,
      authority: f.authority,
      generateSyntheticText,
    });
    expect(result).toEqual({ state: 'held' });
    expect(f.calls).toEqual([]);
    expect(generateSyntheticText).not.toHaveBeenCalled();
  });

  it('preserves Pin-first fail-closed flow when authority denies/revokes original Grant', async () => {
    const candidate = validFixture();
    const f = syntheticAuthority();
    const generateSyntheticText = vi.fn(async () => {
      f.calls.push('model');
      f.revoke();
      return 'PRIVATE_SYNTHETIC_TEXT';
    });
    expect(await runSeyeonOfflineS0ScopedTurnV1({
      identity, candidate, selection: candidate.selection,
      authority: f.authority, generateSyntheticText,
    })).toEqual({ state: 'held' });
    expect(f.calls).toEqual(['pin', 'model', 'commit']);
  });
});
