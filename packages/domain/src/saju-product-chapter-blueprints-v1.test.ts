import {describe,expect,it} from 'vitest';
import {
  APPROVED_SAJU_CATALOG_V1,SAJU_READING_COMPONENTS_V1,
} from '../../contracts/src/approved-saju-catalog.js';
import {
  NOTION_SAJU_PRODUCT_CHAPTER_BLUEPRINTS_V1,
  getSajuProductChapterBlueprintV1,
} from './saju-product-chapter-blueprints-v1.js';
import {
  buildWealthProductChapterPlacementV1,
} from './saju-wealth-chapter-placement-v1.js';
import {
  hashCharacterSajuGroundingBundleMaterialV1,
  type CharacterGroundingUnitViewV1,
  type CharacterSajuGroundingBundleViewV1,
} from './character-saju-insight-selector.js';
import type {CharacterReadingPlanDecisionV1} from './character-saju-reading-plan.js';
import {
  SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
  SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
} from './character-saju-grounding-admission.js';

const titles=[
  '돈복을 타고났을까?','돈은 어디에서 들어오는가','버는 돈과 남는 돈',
  '돈이 새어나가는 곳','당신의 특별한 돈 이야기 — 특별 심층 장','결국 돈을 남기는 사람은',
];
function unit(index:number,axis:CharacterGroundingUnitViewV1['axis'],role:CharacterGroundingUnitViewV1['narrativeRole']='primary'):CharacterGroundingUnitViewV1{
  return {
    unitId:'grounding_unit_'+String(index).repeat(24),
    domain:'wealth',axis,narrativeRole:role,
    semanticKey:'actual-approved-meaning-'+index,
    canonicalMeaning:'이 명식에서 승인된 근거 의미 '+index,
    sourceBlockRefs:['sections.0.blocks.'+index],
    requiredCompanionUnitRefs:[],requiredDisclosureRefs:[],
    realizationPolicyRef:'bounded_semantic_paraphrase_v1',
  };
}
function caseInput(units:readonly CharacterGroundingUnitViewV1[]){
  const material={
    schemaVersion:SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
    groundingProjectionVersion:SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    axisRegistryVersion:SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
    readingRef:'issued-wealth-001',productResponseVersion:'v2',
    engineVersion:'saju-engine-v1',
    readingDomain:'wealth' as const,
    sourceResponseHash:'d'.repeat(64),
    units,disclosures:[],ambiguities:[],
  };
  const grounding:CharacterSajuGroundingBundleViewV1={
    ...material,groundingHash:hashCharacterSajuGroundingBundleMaterialV1(material),
  };
  const orderedUnitIds=units.map(u=>u.unitId);
  const selection={
    characterId:'taegyeom',
    readingRef:material.readingRef,
    requestedDomain:'wealth',
    orderedUnitIds,selectedUnitIds:orderedUnitIds,
  };
  const plan={
    readingRef:material.readingRef,
    characterId:'taegyeom',
    requestedDomain:'wealth',
    planId:'approved-character-plan-v1',
    beats:units.map(u=>({kind:'semantic_realization',unitRefs:[u.unitId],purpose:'expand'})),
  };
  const decision={mode:'character_plan',selection,plan} as unknown as CharacterReadingPlanDecisionV1;
  return {component:'wealth' as const,decision,grounding};
}
describe('Notion approved saju product chapter blueprints',()=>{
  it('covers exactly seven Saju components while preserving 14 approved sale offers',()=>{
    expect(Object.keys(NOTION_SAJU_PRODUCT_CHAPTER_BLUEPRINTS_V1).sort())
      .toEqual(Object.keys(SAJU_READING_COMPONENTS_V1).sort());
    expect(APPROVED_SAJU_CATALOG_V1).toHaveLength(14);
    expect(getSajuProductChapterBlueprintV1('wealth').map(x=>x.fixedTitle)).toEqual(titles);
    expect(getSajuProductChapterBlueprintV1('career')).toHaveLength(6);
    expect(getSajuProductChapterBlueprintV1('business')).toHaveLength(6);
    expect(getSajuProductChapterBlueprintV1('relationship')).toHaveLength(6);
    expect(getSajuProductChapterBlueprintV1('compatibility')).toHaveLength(6);
    expect(getSajuProductChapterBlueprintV1('year')).toHaveLength(5);
    expect(getSajuProductChapterBlueprintV1('month')).toHaveLength(4);
  });
});
describe('Source-owned Wealth 6-chapter placement',()=>{
  const units=[unit(1,'wealth'),unit(2,'expression'),unit(3,'responsibility'),
    unit(4,'tension','tension'),unit(5,'learning')];
  it('reuses three independent approved structures for six different reader questions without new claims',()=>{
    const result=buildWealthProductChapterPlacementV1(caseInput(units));
    expect(result.state).toBe('ready');
    expect(result.chapters.map(x=>x.fixedTitle)).toEqual(titles);
    expect(result.chapters.map(x=>x.status)).toEqual(Array(6).fill('grounded'));
    expect(result.chapters[1]?.primaryUnitIds).toEqual([units[0]!.unitId]);
    expect(result.chapters[2]?.primaryUnitIds).toEqual([units[2]!.unitId]);
    expect(result.chapters[3]?.primaryUnitIds).toEqual([units[3]!.unitId]);
    expect(result.chapters[4]?.primaryUnitIds).toEqual([units[3]!.unitId]);
    expect(result.chapters[4]?.supportingUnitIds).toContain(units[0]!.unitId);
    expect(result.chapters[4]?.supportingUnitIds).toContain(units[2]!.unitId);
    expect(result.chapters[5]?.primaryUnitIds).toEqual([
      units[0]!.unitId,units[2]!.unitId,units[3]!.unitId,
    ]);
    for(const chapter of result.chapters){
      expect(chapter.evidence.length).toBeGreaterThan(0);
      expect(chapter.evidence.every(e=>e.canonicalMeaning.includes('승인된 근거 의미'))).toBe(true);
    }
  });
  it('holds rather than writing six empty generic chapters when evidence does not cover each question',()=>{
    const result=buildWealthProductChapterPlacementV1(caseInput([units[0]!,units[1]!]));
    expect(result.state).toBe('held_insufficient_evidence');
    expect(result.chapters).toHaveLength(6);
    expect(result.missingChapterIds).toContain('wealth-04');
    expect(result.missingChapterIds).toContain('wealth-05');
    expect(result.chapters[3]?.evidence).toEqual([]);
    expect(result.chapters[4]?.evidence).toEqual([]);
  });
  it('rejects tampered canonical meanings, foreign reading identities and protected source',()=>{
    const valid=caseInput(units);
    expect(()=>buildWealthProductChapterPlacementV1({...valid,
      grounding:{...valid.grounding,units:[{...units[0]!,canonicalMeaning:'tampered'},...units.slice(1)]},
    })).toThrow('tampered');
    expect(()=>buildWealthProductChapterPlacementV1({...valid,
      decision:{...valid.decision,selection:{...valid.decision.selection,readingRef:'different'}},
    })).toThrow('mismatch');
    const protectedOnly=caseInput([unit(1,'wealth')]);
    const protectedDecision={...protectedOnly.decision,mode:'protected_fallback' as const};
    const held=buildWealthProductChapterPlacementV1({...protectedOnly,
      decision:protectedDecision as unknown as CharacterReadingPlanDecisionV1});
    expect(held.state).toBe('held_protected_reading');
    expect(held.chapters).toHaveLength(0);
  });
});
