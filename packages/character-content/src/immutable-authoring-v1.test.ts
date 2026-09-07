import { describe, expect, it } from 'vitest';

import {
  CHARACTER_CONCEPT_V1_WORKING_ROSTER,
  CHARACTER_DEITY_MANDATE_CIRCLE_V1,
  CHARACTER_IMMUTABLE_AUTHORING_V1,
  CHARACTER_IMMUTABLE_AUTHORING_V1_CHARACTER_IDS,
  CHARACTER_IMMUTABLE_AUTHORING_V1_SOURCE,
  CHARACTER_RUNTIME_AUTHORING_V1_CHARACTER_IDS,
} from './index.js';

describe('Character immutable authoring v1 authority', () => {
  it('pins the approved #551 source snapshot and remains non-publication authority', () => {
    expect(CHARACTER_IMMUTABLE_AUTHORING_V1_SOURCE).toEqual({
      proposalCommit: '34a226e0943d74c07c8d96e6fcfd4e588351683f',
      proposalBlob: '536f9335d14bd1207313b8684d4f470c7d39abde',
      approvalDocument:
        'docs/source-authority-decisions/CHARACTER_IMMUTABLE_IDENTITY_VISUAL_PROPOSAL_V1_APPROVAL.md',
      productionPublication: 'blocked',
    });
  });

  it('contains exactly the nine approved canonical identities with no duplicates', () => {
    const ids = CHARACTER_IMMUTABLE_AUTHORING_V1.map((entry) => entry.characterId);

    expect(ids).toEqual([...CHARACTER_IMMUTABLE_AUTHORING_V1_CHARACTER_IDS]);
    expect(new Set(ids).size).toBe(9);
    expect(ids).toHaveLength(9);
  });

  it('binds exactly the same canonical ids as approved runtime authoring', () => {
    expect([...CHARACTER_IMMUTABLE_AUTHORING_V1_CHARACTER_IDS]).toEqual([
      ...CHARACTER_RUNTIME_AUTHORING_V1_CHARACTER_IDS,
    ]);
  });

  it('preserves the launch display-name roster in canonical order', () => {
    expect(CHARACTER_IMMUTABLE_AUTHORING_V1.map((entry) => entry.displayName)).toEqual(
      CHARACTER_CONCEPT_V1_WORKING_ROSTER.map((entry) => entry.workingDisplayName),
    );
  });

  it('materializes the approved five-Deity peer Mandate Circle', () => {
    expect(CHARACTER_DEITY_MANDATE_CIRCLE_V1.map((entry) => entry.deityId)).toEqual([
      'deity_gyeol',
      'deity_jeung',
      'deity_gyeon',
      'deity_on',
      'deity_teum',
    ]);
    expect(new Set(CHARACTER_DEITY_MANDATE_CIRCLE_V1.map((entry) => entry.deityId)).size).toBe(5);
  });

  it('keeps every character bound to an approved Deity and complete authored visual profile', () => {
    const deityIds = new Set(CHARACTER_DEITY_MANDATE_CIRCLE_V1.map((entry) => entry.deityId));

    for (const entry of CHARACTER_IMMUTABLE_AUTHORING_V1) {
      expect(deityIds.has(entry.deityId)).toBe(true);
      expect(entry.visual.visualVersion).toBe('visual-v1');
      expect(entry.visual.visualDirection.length).toBeGreaterThan(0);
      expect(entry.visual.silhouette.length).toBeGreaterThan(0);
      expect(entry.visual.palette).toHaveLength(3);
      expect(entry.visual.motifs.length).toBeGreaterThan(0);
      expect(entry.visual.costumeDirection.length).toBeGreaterThan(0);
      expect(entry.visual.prohibitedTropes.length).toBeGreaterThan(0);
    }
  });

  it('does not smuggle publication-only asset, cue, bundle, or release authority into #551 materialization', () => {
    const forbiddenKeys = new Set([
      'assetRefs',
      'emotionIds',
      'animationCueIds',
      'assetManifestHash',
      'bundleId',
      'contentBundleId',
      'releaseId',
      'releaseKey',
    ]);

    for (const entry of CHARACTER_IMMUTABLE_AUTHORING_V1) {
      for (const key of Object.keys(entry)) {
        expect(forbiddenKeys.has(key)).toBe(false);
      }
    }
  });
});
