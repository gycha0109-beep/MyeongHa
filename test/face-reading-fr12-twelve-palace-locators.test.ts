import { describe, expect, it } from 'vitest';
import {
  FACE_AUTHORITY_RESEARCH_REGISTRY_FR12,
  FACE_METHOD_REFS_V0,
  FACE_RESEARCH_PACK_FR12,
  LIUZHUANG_TWELVE_PALACE_METHOD_REF_V0,
  SHENXIANG_TWELVE_PALACE_METHOD_REF_V0,
  TWELVE_PALACE_DEFINITIONS_V0,
  TWELVE_PALACE_LOCATOR_PASSAGES_V0,
  TWELVE_PALACE_REGION_MAPS_V0,
  projectTwelvePalaceResearchMapV0,
  validateFaceAuthorityRegistry,
  validateTwelvePalaceDefinitionsV0,
  type TwelvePalaceDefinitionV0,
} from '../packages/face-reading/src/index.js';

function byPalace(
  tradition: 'shenxiang' | 'liuzhuang',
  palaceKey: TwelvePalaceDefinitionV0['palaceKey'],
): TwelvePalaceDefinitionV0 {
  const value = TWELVE_PALACE_DEFINITIONS_V0.find(
    (definition) =>
      definition.tradition === tradition && definition.palaceKey === palaceKey,
  );
  if (value === undefined) throw new Error(`missing ${tradition}.${palaceKey}`);
  return value;
}

describe('FR-12 Twelve Palace locator authority', () => {
  it('validates the full FR-12 authority overlay', () => {
    expect(() => validateFaceAuthorityRegistry(FACE_AUTHORITY_RESEARCH_REGISTRY_FR12)).not.toThrow();
    expect(validateTwelvePalaceDefinitionsV0()).toHaveLength(24);
  });

  it('preserves exactly twelve palaces per tradition with independent methodology refs', () => {
    const shenxiang = TWELVE_PALACE_DEFINITIONS_V0.filter(
      (definition) => definition.tradition === 'shenxiang',
    );
    const liuzhuang = TWELVE_PALACE_DEFINITIONS_V0.filter(
      (definition) => definition.tradition === 'liuzhuang',
    );

    expect(shenxiang).toHaveLength(12);
    expect(liuzhuang).toHaveLength(12);
    expect(new Set(shenxiang.map((definition) => definition.palaceKey)).size).toBe(12);
    expect(new Set(liuzhuang.map((definition) => definition.palaceKey)).size).toBe(12);
    expect(new Set(shenxiang.map((definition) => definition.methodologyRef))).toEqual(
      new Set([SHENXIANG_TWELVE_PALACE_METHOD_REF_V0]),
    );
    expect(new Set(liuzhuang.map((definition) => definition.methodologyRef))).toEqual(
      new Set([LIUZHUANG_TWELVE_PALACE_METHOD_REF_V0]),
    );
  });

  it('does not flatten the Twelve Palaces into twelve identical face points', () => {
    const shenxiangKinds = new Set(
      TWELVE_PALACE_DEFINITIONS_V0
        .filter((definition) => definition.tradition === 'shenxiang')
        .map((definition) => definition.locator.kind),
    );

    expect(shenxiangKinds).toEqual(
      new Set(['local', 'paired', 'distributed', 'composite', 'global_configuration']),
    );
    expect(byPalace('shenxiang', 'wealth').locator.kind).toBe('composite');
    expect(byPalace('shenxiang', 'siblings').locator.kind).toBe('paired');
    expect(byPalace('shenxiang', 'migration').locator.kind).toBe('distributed');
    expect(byPalace('shenxiang', 'appearance').locator.kind).toBe('global_configuration');
  });

  it('keeps source-specific locator differences instead of silently merging them', () => {
    const shenxiangWealth = byPalace('shenxiang', 'wealth');
    const liuzhuangWealth = byPalace('liuzhuang', 'wealth');
    const shenxiangMigration = byPalace('shenxiang', 'migration');
    const liuzhuangMigration = byPalace('liuzhuang', 'migration');

    expect(shenxiangWealth.locator.kind).toBe('composite');
    expect(liuzhuangWealth.locator.kind).toBe('local');
    expect(shenxiangWealth.locator.anchorRefs).not.toEqual(liuzhuangWealth.locator.anchorRefs);

    expect(shenxiangMigration.locator.kind).toBe('distributed');
    expect(liuzhuangMigration.locator.kind).toBe('paired');
    expect(shenxiangMigration.locator.anchorRefs).not.toEqual(liuzhuangMigration.locator.anchorRefs);
  });

  it('treats 相貌宮 as whole-face configuration rather than a clickable single point', () => {
    for (const tradition of ['shenxiang', 'liuzhuang'] as const) {
      const appearance = byPalace(tradition, 'appearance');
      expect(appearance.locator.kind).toBe('global_configuration');
      expect(appearance.locator.requiresConfigurationRefs).toEqual(['five_yue', 'three_divisions']);

      const projected = projectTwelvePalaceResearchMapV0(tradition);
      const item = projected.items.find((candidate) => candidate.palaceKey === 'appearance');
      expect(item?.interactionMode).toBe('whole_face_configuration');
    }
  });

  it('keeps 疾厄宮 locator history while blocking medical inference', () => {
    for (const tradition of ['shenxiang', 'liuzhuang'] as const) {
      const illness = byPalace(tradition, 'illness');
      expect(illness.productSafety.locatorOnly).toBe(true);
      expect(illness.productSafety.blockedInferenceKeys).toEqual(
        expect.arrayContaining([
          'medical_diagnosis',
          'disease_prediction',
          'health_status_inference',
        ]),
      );
    }
  });

  it('projects topology only and remains research-only', () => {
    const projection = projectTwelvePalaceResearchMapV0('shenxiang');
    expect(projection.authorityState).toBe('research_only');
    expect(projection.items).toHaveLength(12);
    expect(projection.items.map((item) => item.ordinal)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(projection.items.every((item) => item.sourceRefs.length === 1)).toBe(true);
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.items)).toBe(true);
  });

  it('keeps all locator passages unverified until direct scan checking exists', () => {
    expect(TWELVE_PALACE_LOCATOR_PASSAGES_V0).toHaveLength(24);
    expect(
      TWELVE_PALACE_LOCATOR_PASSAGES_V0.every(
        (passage) => passage.verificationStatus === 'unverified_ocr',
      ),
    ).toBe(true);
  });

  it('upgrades the FR-12 pack without treating the old placeholder methodology as authority', () => {
    expect(FACE_RESEARCH_PACK_FR12.methodologyDefinitionRefs).not.toContain(
      FACE_METHOD_REFS_V0.twelvePalaces,
    );
    expect(FACE_RESEARCH_PACK_FR12.methodologyDefinitionRefs).toContain(
      SHENXIANG_TWELVE_PALACE_METHOD_REF_V0,
    );
    expect(FACE_RESEARCH_PACK_FR12.methodologyDefinitionRefs).toContain(
      LIUZHUANG_TWELVE_PALACE_METHOD_REF_V0,
    );
    expect(FACE_RESEARCH_PACK_FR12.regionMapRefs).toEqual(
      expect.arrayContaining(
        TWELVE_PALACE_REGION_MAPS_V0.map(
          (map) => `${map.regionMapId}@${map.version}`,
        ),
      ),
    );
  });

  it('fails closed if a tradition loses one palace', () => {
    const incomplete = TWELVE_PALACE_DEFINITIONS_V0.filter(
      (definition) =>
        !(definition.tradition === 'shenxiang' && definition.palaceKey === 'life'),
    );
    expect(() => validateTwelvePalaceDefinitionsV0(incomplete)).toThrow(/exactly 12/u);
  });

  it('fails closed if 疾厄宮 medical blocks are removed', () => {
    const forged = TWELVE_PALACE_DEFINITIONS_V0.map((definition) =>
      definition.tradition === 'shenxiang' && definition.palaceKey === 'illness'
        ? {
            ...definition,
            productSafety: {
              locatorOnly: true as const,
              blockedInferenceKeys: [],
            },
          }
        : definition,
    );
    expect(() => validateTwelvePalaceDefinitionsV0(forged)).toThrow(/must block/u);
  });
});
