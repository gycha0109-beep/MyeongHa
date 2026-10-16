import { describe, expect, it, vi } from 'vitest';
import {
  replaySeyeonOfflineGrantedTurnV1,
  runSeyeonOfflineGrantedTurnV1,
  type SeyeonOfflineGrantedTurnAuthorityV1,
} from '../apps/api/src/seyeon-offline-granted-turn-v1.js';
import type {
  SeyeonExactModelPersonalSourceSelectionV1,
} from '../apps/api/src/seyeon-exact-model-personal-source-selection-v1.js';

const digest = 'sha256:v1:' + 'a'.repeat(64);
const identity = Object.freeze({
  subjectId: 'synthetic-subject',
  threadId: 'synthetic-thread',
  turnId: 'synthetic-turn',
  attemptId: 'synthetic-attempt',
  characterId: 'seyeon' as const,
});
const selection: SeyeonExactModelPersonalSourceSelectionV1 = Object.freeze({
  version: 'seyeon-exact-model-personal-source-selection-v1',
  selectedMemoryCount: 1,
  selectedPersonalRecordCount: 1,
  selectedSources: Object.freeze([Object.freeze({
    recordKind: 'memory' as const,
    recordId: 'synthetic-memory',
    grantId: 'original-grant',
    recordType: 'synthetic-test-only',
    schemaVersion: 'synthetic-v1',
    rawRecordDigest: digest,
    projectedMemoryDigest: digest,
  })]),
  selectedSourcesDigest: digest,
  persistedBeforeModel: false,
  permitsAtomicCommit: false,
  permitsHttpReveal: false,
});

function fixture() {
  let originalGrantActive = true;
  let committedText: string | null = null;
  let currentGrantId = 'original-grant';
  const calls: string[] = [];
  const authority: SeyeonOfflineGrantedTurnAuthorityV1 = {
    async pinBeforeModel({ identity: scope, selection: sources }) {
      calls.push('pin');
      if (scope.attemptId !== identity.attemptId ||
          sources.selectedSources[0]?.grantId !== 'original-grant') {
        throw new Error('invalid source');
      }
      return {
        attemptId: scope.attemptId,
        selectedSourcesDigest: sources.selectedSourcesDigest,
        pinRef: 'durable-pin',
      };
    },
    async commitWithGrantRecheck({ identity: scope, pin, generatedText }) {
      calls.push('commit');
      if (!originalGrantActive || currentGrantId !== 'original-grant' ||
          scope.attemptId !== pin.attemptId) throw new Error('revoked');
      committedText = generatedText;
      return {
        attemptId: scope.attemptId,
        pinRef: pin.pinRef,
        commitRef: 'durable-commit',
      };
    },
    async revealCommitted({ commit }) {
      calls.push('reveal');
      return originalGrantActive && currentGrantId === 'original-grant' &&
        commit.commitRef === 'durable-commit'
        ? committedText : null;
    },
    async replayWithCurrentGrantRecheck({ characterId, subjectId, turnId }) {
      calls.push('replay');
      return characterId === 'seyeon' && subjectId === identity.subjectId &&
        turnId === identity.turnId && originalGrantActive &&
        currentGrantId === 'original-grant' ? committedText : null;
    },
  };
  return {
    authority, calls,
    revoke: () => { originalGrantActive = false; },
    replaceGrant: () => {
      originalGrantActive = false;
      currentGrantId = 'new-grant';
    },
  };
}

describe('Se-yeon offline positive-grant consent execution seam (synthetic only)', () => {
  it('pins before synthetic model, commits with original grant and checks reveal/replay', async () => {
    const f = fixture();
    const generate = vi.fn(async () => {
      f.calls.push('model');
      return '합성 답변';
    });
    expect(await runSeyeonOfflineGrantedTurnV1({
      identity, selection, authority: f.authority, generateSyntheticText: generate,
    })).toEqual({ state: 'revealed', text: '합성 답변' });
    expect(f.calls).toEqual(['pin', 'model', 'commit', 'reveal']);
    expect(await replaySeyeonOfflineGrantedTurnV1({
      subjectId: identity.subjectId, threadId: identity.threadId,
      turnId: identity.turnId, authority: f.authority,
    })).toEqual({ state: 'revealed', text: '합성 답변' });
  });

  it('does not run model when the durable pre-model pin fails or mismatches', async () => {
    const f = fixture();
    const generate = vi.fn(async () => '합성 답변');
    const failed: SeyeonOfflineGrantedTurnAuthorityV1 = {
      ...f.authority,
      pinBeforeModel: async () => { throw new Error('DB offline'); },
    };
    expect(await runSeyeonOfflineGrantedTurnV1({
      identity, selection, authority: failed, generateSyntheticText: generate,
    })).toEqual({ state: 'held' });
    const mismatched: SeyeonOfflineGrantedTurnAuthorityV1 = {
      ...f.authority,
      pinBeforeModel: async () => ({
        attemptId: 'another-attempt',
        selectedSourcesDigest: selection.selectedSourcesDigest,
        pinRef: 'wrong-pin',
      }),
    };
    expect(await runSeyeonOfflineGrantedTurnV1({
      identity, selection, authority: mismatched, generateSyntheticText: generate,
    })).toEqual({ state: 'held' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('holds all generated text when the original grant is revoked before commit', async () => {
    const f = fixture();
    const result = await runSeyeonOfflineGrantedTurnV1({
      identity, selection, authority: f.authority,
      generateSyntheticText: async () => {
        f.calls.push('model');
        f.revoke();
        return '반환해서는 안 되는 합성 답변';
      },
    });
    expect(result).toEqual({ state: 'held' });
    expect(f.calls).toEqual(['pin', 'model', 'commit']);
  });

  it('blocks first reveal and historical replay after commit-time revocation', async () => {
    const f = fixture();
    const authority: SeyeonOfflineGrantedTurnAuthorityV1 = {
      ...f.authority,
      commitWithGrantRecheck: async (input) => {
        const receipt = await f.authority.commitWithGrantRecheck(input);
        f.revoke();
        return receipt;
      },
    };
    expect(await runSeyeonOfflineGrantedTurnV1({
      identity, selection, authority,
      generateSyntheticText: async () => '유출 금지 합성 답변',
    })).toEqual({ state: 'held' });
    expect(await replaySeyeonOfflineGrantedTurnV1({
      subjectId: identity.subjectId, threadId: identity.threadId,
      turnId: identity.turnId, authority,
    })).toEqual({ state: 'held' });
    expect(f.calls).toContain('reveal');
    expect(f.calls).toContain('replay');
  });

  it('does not revive an earlier attempt when a different grant replaces the original', async () => {
    const f = fixture();
    expect(await runSeyeonOfflineGrantedTurnV1({
      identity, selection, authority: f.authority,
      generateSyntheticText: async () => '합성 답변',
    })).toEqual({ state: 'revealed', text: '합성 답변' });
    f.replaceGrant();
    expect(await replaySeyeonOfflineGrantedTurnV1({
      subjectId: identity.subjectId, threadId: identity.threadId,
      turnId: identity.turnId, authority: f.authority,
    })).toEqual({ state: 'held' });
  });

  it('rejects malformed positive selection before any pin or model dispatch', async () => {
    const f = fixture();
    const generate = vi.fn(async () => '합성 답변');
    expect(await runSeyeonOfflineGrantedTurnV1({
      identity,
      selection: { ...selection, selectedSourcesDigest: 'bad' },
      authority: f.authority,
      generateSyntheticText: generate,
    })).toEqual({ state: 'held' });
    expect(f.calls).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });
});
