import {
  SAJU_READING_COMPONENTS_V1,
  type SajuReadingComponentV1,
} from '../../contracts/src/approved-saju-catalog.js';
import type { CharacterReadingPlanDecisionV1 } from './character-saju-reading-plan.js';
import {
  hashCharacterSajuGroundingBundleMaterialV1,
  type CharacterGroundingUnitViewV1,
  type CharacterSajuGroundingBundleViewV1,
} from './character-saju-insight-selector.js';
import { getSajuProductChapterBlueprintV1 } from './saju-product-chapter-blueprints-v1.js';

export const SAJU_WEALTH_CHAPTER_PLACEMENT_VERSION_V1 =
  'myeongha-saju-wealth-source-owned-chapter-placement-v1' as const;

export type WealthChapterPlacementV1 = Readonly<{
  chapterId: string;
  fixedTitle: string;
  role: string;
  status: 'grounded' | 'missing_required_meaning';
  primaryUnitIds: readonly string[];
  supportingUnitIds: readonly string[];
  tensionUnitIds: readonly string[];
  requiredDisclosureRefs: readonly string[];
  evidence: readonly Readonly<{
    unitId: string;
    canonicalMeaning: string;
    semanticKey: string;
    axis: string;
    sourceBlockRefs: readonly string[];
    qualifiers: readonly string[];
    prohibitedExtensions: readonly string[];
    requiredCompanionUnitRefs: readonly string[];
  }>[];
}>;

export type WealthProductChapterPlacementDecisionV1 = Readonly<{
  version: typeof SAJU_WEALTH_CHAPTER_PLACEMENT_VERSION_V1;
  state: 'ready' | 'held_insufficient_evidence' | 'held_protected_reading';
  readingRef: string;
  characterId: string;
  sourceResponseHash: string;
  groundingHash: string;
  planId: string | null;
  chapters: readonly WealthChapterPlacementV1[];
  missingChapterIds: readonly string[];
}>;

function deny(message: string): never {
  throw new TypeError('Wealth chapter source admission: '+message);
}
function evidence(unit:CharacterGroundingUnitViewV1) {
  return Object.freeze({
    unitId:unit.unitId,
    canonicalMeaning:unit.canonicalMeaning,
    semanticKey:unit.semanticKey,
    axis:unit.axis,
    sourceBlockRefs:Object.freeze([...unit.sourceBlockRefs]),
    qualifiers:Object.freeze([...(unit.qualifiers ?? [])]),
    prohibitedExtensions:Object.freeze([...(unit.prohibitedExtensions ?? [])]),
    requiredCompanionUnitRefs:Object.freeze([...unit.requiredCompanionUnitRefs]),
  });
}
function unitList(selected:readonly CharacterGroundingUnitViewV1[], ids:readonly string[]) {
  const lookup=new Map(selected.map(u=>[u.unitId,u]));
  return Object.freeze(ids.map(id=>{
    const unit=lookup.get(id);
    if(!unit)deny('unknown unit referenced');
    return evidence(unit);
  }));
}
function chapter(input:{
  index:number;
  primary:readonly string[];
  supporting:readonly string[];
  tension:readonly string[];
  selected:readonly CharacterGroundingUnitViewV1[];
  disclosures:readonly string[];
}): WealthChapterPlacementV1 {
  const bp=getSajuProductChapterBlueprintV1('wealth')[input.index]!;
  const refs=[...new Set([...input.primary,...input.supporting,...input.tension])];
  const all=input.selected.filter(u=>refs.includes(u.unitId));
  const requiredDisclosureRefs=[...new Set(all.flatMap(u=>u.requiredDisclosureRefs))];
  const missingRequired=requiredDisclosureRefs.some(id=>!input.disclosures.includes(id));
  if(missingRequired)deny('required source disclosure missing');
  for(const u of all){
    if(u.requiredCompanionUnitRefs.some(id=>!refs.includes(id)))deny('required companion split across chapters');
  }
  return Object.freeze({
    chapterId:bp.chapterId,
    fixedTitle:bp.fixedTitle,
    role:bp.purpose,
    status:input.primary.length>0?'grounded':'missing_required_meaning',
    primaryUnitIds:Object.freeze([...input.primary]),
    supportingUnitIds:Object.freeze([...input.supporting]),
    tensionUnitIds:Object.freeze([...input.tension]),
    requiredDisclosureRefs:Object.freeze(requiredDisclosureRefs),
    evidence:unitList(input.selected,refs),
  });
}

/**
 * Places ONLY units selected by the existing CharacterInsightSelector/ReadingPlan.
 * No new interpretation, duplicate Product Mapper or six generic generated
 * paragraphs. If five distinct chapters cannot be grounded, paid issuance HOLDs.
 */
export function buildWealthProductChapterPlacementV1(input:Readonly<{
  component:SajuReadingComponentV1;
  decision:CharacterReadingPlanDecisionV1;
  grounding:CharacterSajuGroundingBundleViewV1;
}>):WealthProductChapterPlacementDecisionV1 {
  if(input.component!=='wealth')deny('component is not wealth');
  if(SAJU_READING_COMPONENTS_V1[input.component].domain!==input.grounding.readingDomain ||
      input.decision.selection.requestedDomain!=='wealth' ||
      input.decision.selection.readingRef!==input.grounding.readingRef)deny('source domain/reading mismatch');
  const {groundingHash,...hashMaterial}=input.grounding;
  if(hashCharacterSajuGroundingBundleMaterialV1(hashMaterial)!==groundingHash)deny('tampered source grounding');
  const selectedIds=input.decision.selection.orderedUnitIds;
  if(new Set(selectedIds).size!==selectedIds.length ||
      selectedIds.length!==input.decision.selection.selectedUnitIds.length ||
      selectedIds.some(id=>!input.decision.selection.selectedUnitIds.includes(id)))deny('invalid selected unit order');
  const indexed=new Map(input.grounding.units.map(u=>[u.unitId,u]));
  const selected=selectedIds.map(id=>{
    const unit=indexed.get(id);
    if(!unit || unit.domain!=='wealth' || unit.sourceBlockRefs.length===0)deny('unapproved selected source');
    return unit;
  });
  if(input.decision.mode!=='character_plan'){
    return Object.freeze({
      version:SAJU_WEALTH_CHAPTER_PLACEMENT_VERSION_V1,
      state:'held_protected_reading' as const,
      readingRef:input.grounding.readingRef,
      characterId:input.decision.selection.characterId,
      sourceResponseHash:input.grounding.sourceResponseHash,
      groundingHash,
      planId:null,
      chapters:Object.freeze([]),
      missingChapterIds:Object.freeze(getSajuProductChapterBlueprintV1('wealth').map(c=>c.chapterId)),
    });
  }
  const plan=input.decision.plan;
  if(plan.readingRef!==input.grounding.readingRef ||
      plan.characterId!==input.decision.selection.characterId ||
      plan.requestedDomain!=='wealth')deny('reading plan identity mismatch');
  const beats=plan.beats.filter(b=>b.kind==='semantic_realization');
  const actualBeatRefs=beats.flatMap(b=>b.unitRefs);
  if(actualBeatRefs.length!==selectedIds.length ||
      selectedIds.some(id=>!actualBeatRefs.includes(id)) ||
      new Set(actualBeatRefs).size!==actualBeatRefs.length)deny('selected units not represented by actual plan beats');
  const disclosureRefs=input.grounding.disclosures.map(d=>d.disclosureRef);
  const scheduledDisclosures=new Set(plan.beats.filter(b=>b.kind==='protected_disclosure').map(b=>b.disclosureRef));
  for(const unit of selected)if(unit.requiredDisclosureRefs.some(ref=>!scheduledDisclosures.has(ref)))deny('plan omits required disclosure');
  const allowed = selected.filter(u => u.narrativeRole !== 'limitation' &&
    u.realizationPolicyRef !== 'protected_only_v1');
  // V2 source-owned Wealth semantic payload already maps distinct structures
  // to wealth / responsibility / tension / decision_style. The older V1
  // grouping does not distinguish them; never infer which is which from prose.
  const findAxis = (axis:string) => allowed.find(u => u.axis === axis);
  const creation=findAxis('wealth');
  const management=findAxis('responsibility');
  const friction=allowed.find(u => u.axis==='tension' && u.narrativeRole==='tension');
  const spending=findAxis('decision_style');
  const distinct=allowed.filter((u,index)=>
    allowed.findIndex(x=>x.axis===u.axis)===index);
  const asRefs=(units:readonly (CharacterGroundingUnitViewV1|undefined)[])=>
    units.filter((u):u is CharacterGroundingUnitViewV1=>u!==undefined).map(u=>u.unitId);
  function withRequiredCompanions(primary:readonly string[], supporting:readonly string[], tension:readonly string[]){
    const all=[...new Set([...primary,...supporting,...tension])];
    const pending=[...all];
    for(let i=0;i<pending.length;i++){
      const u=indexed.get(pending[i]!);
      if(!u)deny('missing selected canonical source');
      for(const ref of u.requiredCompanionUnitRefs){
        if(!selectedIds.includes(ref))deny('selected source omits required companion');
        if(!all.includes(ref)){all.push(ref);pending.push(ref);}
      }
    }
    return {
      primary:Object.freeze([...primary]),
      supporting:Object.freeze(all.filter(id=>!primary.includes(id) && indexed.get(id)?.narrativeRole!=='tension')),
      tension:Object.freeze(all.filter(id=>!primary.includes(id) && indexed.get(id)?.narrativeRole==='tension')),
    };
  }
  const make=(index:number,main:readonly (CharacterGroundingUnitViewV1|undefined)[],
    context:readonly (CharacterGroundingUnitViewV1|undefined)[]=[])=>{
    const mainRefs=asRefs(main), supportRefs=asRefs(context);
    const split=withRequiredCompanions(mainRefs,supportRefs,[]);
    return chapter({index,...split,selected,disclosures:disclosureRefs});
  };
  const chapters:WealthChapterPlacementV1[]=[];
  // Opening: the full structure, not a fourth unsupported standalone claim.
  chapters.push(distinct.length>=2 && creation
    ? make(0,[creation],[management,friction,spending]) : make(0,[]));
  // Origin: approved value-creation evidence, never predicted income.
  chapters.push(make(1,[creation]));
  // Earned vs retained: both sides must actually exist, not generic budgeting.
  chapters.push(creation && management
    ? make(2,[management],[creation]) : make(2,[]));
  // Friction: only a real tension Claim, not a guess about spending habits.
  chapters.push(make(3,[friction],[management,spending]));
  // Individual deep chapter: at least three different approved structural
  // axes jointly present; the writer may contrast them, not invent a fourth.
  chapters.push(creation && management && friction &&
    new Set([creation.axis,management.axis,friction.axis]).size===3
    ? make(4,[friction],[creation,management,spending]) : make(4,[]));
  // Conclusion is an editorial synthesis of verified claims, never a new
  // fortune or investment recommendation.
  chapters.push(creation && management && friction
    ? make(5,[creation,management,friction],[spending]) : make(5,[]));
  const missing=chapters.filter(c=>c.status!=='grounded').map(c=>c.chapterId);
  return Object.freeze({
    version:SAJU_WEALTH_CHAPTER_PLACEMENT_VERSION_V1,
    state:missing.length===0?'ready':'held_insufficient_evidence',
    readingRef:input.grounding.readingRef,
    characterId:plan.characterId,
    sourceResponseHash:input.grounding.sourceResponseHash,
    groundingHash,
    planId:plan.planId,
    chapters:Object.freeze(chapters),
    missingChapterIds:Object.freeze(missing),
  });
}
