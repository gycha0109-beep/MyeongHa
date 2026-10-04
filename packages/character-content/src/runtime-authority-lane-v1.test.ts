import { describe, expect, it } from 'vitest';

import {
  CHARACTER_RUNTIME_AUTHORING_V1,
} from './runtime-authoring-v1.js';
import {
  CHARACTER_RUNTIME_AUTHORITY_LANE_CHARACTER_IDS_V1,
  resolveCharacterRuntimeAuthorityLaneV1,
} from './runtime-authority-lane-v1.js';

describe('parallel Character runtime authority lanes v1', () => {
  it('registers Seyeon as the first independent lane only', () => {
    expect(CHARACTER_RUNTIME_AUTHORITY_LANE_CHARACTER_IDS_V1).toEqual([
      'seyeon',
    ]);
    expect(resolveCharacterRuntimeAuthorityLaneV1('yeoul')).toBeNull();
    expect(resolveCharacterRuntimeAuthorityLaneV1('rahyeon')).toBeNull();
  });

  it('uses the reviewed action-oriented Seyeon runtime instead of the stale calm-reviewer projection', () => {
    const lane = resolveCharacterRuntimeAuthorityLaneV1('seyeon');
    expect(lane).not.toBeNull();
    if (lane === null) throw new Error('Seyeon runtime authority is required');

    expect(lane.speech.register).toBe('밝고 행동적인 현실형 동행자');
    expect(lane.communication.register).toBe(
      '밝고 행동적인 현실형 동행자',
    );
    expect(lane.questioning.preferredStrategies).toEqual([
      'activate_next_step',
      'clarify_boundary',
    ]);
    expect(lane.speech.register).not.toBe('차분하고 균형 잡힌 검토자');
  });

  it('preserves exact runtime object identity for downstream domain bindings', () => {
    const lane = resolveCharacterRuntimeAuthorityLaneV1('seyeon');
    const runtime = CHARACTER_RUNTIME_AUTHORING_V1.find(
      (entry) => entry.characterId === 'seyeon',
    );
    expect(lane).not.toBeNull();
    expect(runtime).toBeDefined();
    if (lane === null || runtime === undefined) {
      throw new Error('Seyeon runtime authority is required');
    }

    expect(lane.runtime).toBe(runtime);
    expect(lane.speech).toBe(runtime.speech);
    expect(lane.communication).toBe(runtime.persona.communication);
    expect(lane.questioning).toBe(runtime.persona.questioning);
  });

  it('derives a deterministic authority version from reviewed provenance and runtime payload', () => {
    const first = resolveCharacterRuntimeAuthorityLaneV1('seyeon');
    const second = resolveCharacterRuntimeAuthorityLaneV1('seyeon');
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    if (first === null || second === null) {
      throw new Error('Seyeon runtime authority is required');
    }

    expect(first.authorityVersion).toBe(second.authorityVersion);
    expect(first.authorityVersion).toMatch(
      /^sha256:v1:[0-9a-f]{64}$/u,
    );
    expect(first.provenance.reviewedCommit).toBe(
      'a0afd9bda57ae0a3f48396d9b55a651403bbcc41',
    );
    expect(first.provenance.bible.blobSha).toBe(
      'de6cef1a86d690f7d614967707fe953471792123',
    );
    expect(first.provenance.runtime.blobSha).toBe(
      'fcaa41f08a04ac66942609a5023fa6f69e9896a0',
    );
  });
});
