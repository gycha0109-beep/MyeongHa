import { describe, expect, it } from 'vitest';
import {
  FACE_AUTHORITY_RESEARCH_REGISTRY_FR13,
  FACE_RESEARCH_PACK_FR13,
  FACE_SEMANTIC_ANCHOR_REGISTRY_FR13,
  FR13_ANCHOR_CONFLICTS,
  TRADITIONAL_FACE_ANCHORS_FR13,
  TWELVE_PALACE_DEFINITIONS_V0,
  evaluateTwelvePalaceAnchorReadinessFR13,
  getTraditionalFaceAnchorFR13,
  validateFaceAuthorityRegistry,
  validateFaceSemanticAnchorAuthorityFR13,
  validateTraditionalFaceAnchorRegistryFR13,
} from '../packages/face-reading/src/index.js';

function palace(tradition: 'shenxiang' | 'liuzhuang', palaceKey: string) {
  const value = TWELVE_PALACE_DEFINITIONS_V0.find(
    (definition) => definition.tradition === tradition && definition.palaceKey === palaceKey,
  );
  if (value === undefined) throw new Error(`missing palace ${tradition}.${palaceKey}`);
  return value;
}

describe('FR-13 semantic anchor registry', () => {
  it('validates the full authority overlay and exact anchor pin', () => {
    expect(() => validateFaceAuthorityRegistry(FACE_AUTHORITY_RESEARCH_REGISTRY_FR13)).not.toThrow();
    expect(() => validateFaceSemanticAnchorAuthorityFR13()).not.toThrow();
    expect(FACE_RESEARCH_PACK_FR13.semanticAnchorRegistryRef).toBe(
      `${FACE_SEMANTIC_ANCHOR_REGISTRY_FR13.registryId}@${FACE_SEMANTIC_ANCHOR_REGISTRY_FR13.version}`,
    );
    expect(FACE_RESEARCH_PACK_FR13.version).toBe('0.4.0');
  });

  it('resolves every FR-12 locator anchor through one versioned registry', () => {
    expect(() => validateTraditionalFaceAnchorRegistryFR13()).not.toThrow();
    const refs = new Set(
      TWELVE_PALACE_DEFINITIONS_V0.flatMap((definition) => definition.locator.anchorRefs),
    );
    for (const ref of refs) {
      expect(getTraditionalFaceAnchorFR13(ref).anchorRef).toBe(ref);
    }
  });

  it('keeps provider indexes, coordinates and polygons out of semantic anchor structure', () => {
    for (const anchor of TRADITIONAL_FACE_ANCHORS_FR13) {
      const structural = JSON.stringify({ ...anchor, notes: [] });
      expect(structural).not.toMatch(/landmark|index|coordinate|polygon|mediapipe|facemesh/iu);
    }
  });

  it('allows neutral observation anchors to wait on a provider contract without classical source refs', () => {
    for (const ref of ['left_eye', 'right_eye', 'left_brow', 'right_brow', 'nose']) {
      const anchor = getTraditionalFaceAnchorFR13(ref);
      expect(anchor.authorityClass).toBe('neutral_observation');
      expect(anchor.sourceRefs).toEqual([]);
      expect(anchor.providerBindingStatus).toBe('provider_contract_required');
    }
  });

  it('blocks traditional named regions from exact provider binding before operationalization', () => {
    for (const ref of ['shangen', 'yintang', 'nianshou', 'dige', 'zhongzheng', 'ligong']) {
      const anchor = getTraditionalFaceAnchorFR13(ref);
      expect(anchor.authorityClass).toBe('traditional_named_region');
      expect(anchor.sourceRefs.length).toBeGreaterThan(0);
      expect(anchor.providerBindingStatus).toBe('blocked_needs_operationalization');
    }
  });

  it('migrates old tear-trough keys without asserting modern anatomical equivalence', () => {
    const left = getTraditionalFaceAnchorFR13('left_tear_trough');
    const right = getTraditionalFaceAnchorFR13('right_tear_trough');
    expect(left.authorityClass).toBe('legacy_alias');
    expect(right.authorityClass).toBe('legacy_alias');
    expect(left.canonicalAnchorRef).toBe('left_leitang_region');
    expect(right.canonicalAnchorRef).toBe('right_leitang_region');
    expect(left.providerBindingStatus).toBe('blocked_alias_migration');
    expect(right.providerBindingStatus).toBe('blocked_alias_migration');
  });

  it('keeps 水星 separate from the legacy mouth-shuixing shortcut', () => {
    const alias = getTraditionalFaceAnchorFR13('mouth_shuixing');
    const canonical = getTraditionalFaceAnchorFR13('shuixing_region');
    expect(alias.authorityClass).toBe('legacy_alias');
    expect(alias.canonicalAnchorRef).toBe('shuixing_region');
    expect(alias.providerBindingStatus).toBe('blocked_alias_migration');
    expect(canonical.authorityClass).toBe('traditional_named_region');
  });

  it('registers the 柳莊 淚堂/臥蠶 contradiction as an open authority conflict', () => {
    expect(FR13_ANCHOR_CONFLICTS).toHaveLength(1);
    const conflict = FR13_ANCHOR_CONFLICTS[0]!;
    expect(conflict.conflictId).toBe(
      'conflict.liuzhuang.children_palace.leitang_wocan_equivalence_v0',
    );
    expect(conflict.status).toBe('open');
    expect(conflict.sourceRefs).toEqual(
      expect.arrayContaining([
        'passage.liuzhuang.twelve_palaces.children.locator',
        'passage.liuzhuang.leitang_wocan.distinction',
      ]),
    );

    for (const ref of [
      'left_leitang_region',
      'right_leitang_region',
      'left_wocan_region',
      'right_wocan_region',
    ]) {
      const anchor = getTraditionalFaceAnchorFR13(ref);
      expect(anchor.providerBindingStatus).toBe('blocked_open_conflict');
      expect(anchor.blockingConflictRefs).toContain(conflict.conflictId);
    }
  });

  it('reports 柳莊 男女宮 as blocked rather than guessing an under-eye geometry', () => {
    const readiness = evaluateTwelvePalaceAnchorReadinessFR13(
      palace('liuzhuang', 'children'),
    );
    expect(readiness.state).toBe('blocked');
    expect(readiness.unresolvedAnchorRefs).toEqual(
      expect.arrayContaining(['left_tear_trough', 'right_tear_trough']),
    );
  });

  it('keeps neutral-eye 田宅宮 only as a binding candidate, not a semantic production claim', () => {
    const readiness = evaluateTwelvePalaceAnchorReadinessFR13(
      palace('shenxiang', 'property'),
    );
    expect(readiness.state).toBe('binding_candidate');
    expect(readiness.unresolvedAnchorRefs).toEqual([]);
    expect(FACE_SEMANTIC_ANCHOR_REGISTRY_FR13.authorityState).toBe('research_only');
  });

  it('resolves 相貌宮 configuration refs without collapsing them to a point', () => {
    const fiveYue = getTraditionalFaceAnchorFR13('five_yue_configuration');
    const threeDivisions = getTraditionalFaceAnchorFR13('three_divisions_configuration');
    expect(fiveYue.semanticShape).toBe('configuration');
    expect(threeDivisions.semanticShape).toBe('configuration');
    expect(fiveYue.providerBindingStatus).toBe('blocked_needs_operationalization');
    expect(threeDivisions.providerBindingStatus).toBe('blocked_needs_operationalization');
  });

  it('fails closed when an FR-12 anchor is removed from the registry', () => {
    const incomplete = TRADITIONAL_FACE_ANCHORS_FR13.filter(
      (anchor) => anchor.anchorRef !== 'shangen',
    );
    expect(() => validateTraditionalFaceAnchorRegistryFR13(incomplete)).toThrow(
      /unresolved/u,
    );
  });

  it('fails closed when a legacy alias points at a missing canonical anchor', () => {
    const forged = TRADITIONAL_FACE_ANCHORS_FR13.map((anchor) =>
      anchor.anchorRef === 'left_tear_trough'
        ? { ...anchor, canonicalAnchorRef: 'missing_anchor' }
        : anchor,
    );
    expect(() => validateTraditionalFaceAnchorRegistryFR13(forged)).toThrow(
      /canonicalAnchorRef is unknown/u,
    );
  });
});
