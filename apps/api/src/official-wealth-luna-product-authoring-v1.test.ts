import { describe,expect,it } from 'vitest';
import {
  SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
  SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
} from '../../../packages/domain/src/character-saju-grounding-admission.js';
import { CHARACTER_PERSPECTIVE_SCHEMA_VERSION_V1 } from '../../../packages/domain/src/character-saju-perspective.js';
import {
  hashCharacterSajuGroundingBundleMaterialV1,
  type CharacterSajuGroundingBundleViewV1,
  type CharacterGroundingUnitViewV1,
} from '../../../packages/domain/src/character-saju-insight-selector.js';
import type {CharacterRuntimeContextWithGroundingV1} from '../../../packages/domain/src/character-saju-grounding-admission.js';
import type {CharacterPerspectiveProfileV1} from '../../../packages/domain/src/character-saju-perspective.js';
import type {OfficialReadingRecordV1} from './official-reading-record-read.js';
import {authorApprovedWealthProductSourceV1} from './official-wealth-luna-product-authoring-v1.js';
import type {SignedNativeReadingToIssuedRecordBindingV1} from './official-wealth-luna-product-source-v1.js';

const ID='11111111-1111-4111-8111-111111111111';
function unit(i:number,axis:CharacterGroundingUnitViewV1['axis'],role:CharacterGroundingUnitViewV1['narrativeRole']='primary'):CharacterGroundingUnitViewV1{
 return {
  unitId:'grounding_unit_'+String(i).repeat(24),domain:'wealth',axis,narrativeRole:role,
  semanticKey:'source-wealth-'+i,
  canonicalMeaning:'실제 공식 Saju 의미 '+i+' · 확인된 구조의 사용 조건',
  sourceBlockRefs:['sections.0.blocks.'+i],requiredDisclosureRefs:[],
  requiredCompanionUnitRefs:[],realizationPolicyRef:'bounded_semantic_paraphrase_v1',
 };
}
function fixture(axes:CharacterGroundingUnitViewV1['axis'][]=['wealth','responsibility','tension']){
 const units=axes.map((axis,i)=>unit(i+1,axis,axis==='tension'?'tension':'primary'));
 const material={
  schemaVersion:SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
  groundingProjectionVersion:SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  axisRegistryVersion:SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
  readingRef:ID,readingDomain:'wealth' as const,
  productResponseVersion:'myeonghwa-product-reading-response-v2',
  engineVersion:'saju-engine-v1',sourceResponseHash:'a'.repeat(64),
  units,disclosures:[],ambiguities:[],
 };
 const grounding:CharacterSajuGroundingBundleViewV1={
  ...material,groundingHash:hashCharacterSajuGroundingBundleMaterialV1(material),
 };
 const context={
  schemaVersion:'v1',
  characterId:'taegyeom',contentVersion:'authored-content-v1',
  sajuProfile:{profileVersion:'authored-saju-v1',
   followUpQuestionStrategies:[],
   safeFraming:{schemaVersion:'v1',catalogVersion:'v1',before:[],after:[]}},
  relationship:{
   schemaVersion:'v1',relationshipRevision:1,
   relationshipPolicyVersion:'v1',projectionPolicyVersion:'v1',
   behaviorVersion:'v1',matchedBehaviorRuleKey:null,
   stageKey:'acquainted',closenessBand:'low',trustBand:'low',
   frictionBand:'low',recentEventKeys:[],mode:{},
  },
  saju:{
   readingRef:ID,domain:'wealth',coverageState:'complete',
   protectedSegments:[],disclosures:[],ambiguity:[],
   capability:{domain:'wealth',role:'primary',canInitiate:true,capabilityVersion:'v1'},
   groundingRef:{
    schemaVersion:grounding.schemaVersion,
    groundingProjectionVersion:grounding.groundingProjectionVersion,
    axisRegistryVersion:grounding.axisRegistryVersion,
    readingRef:grounding.readingRef,readingDomain:grounding.readingDomain,
    productResponseVersion:grounding.productResponseVersion,
    engineVersion:grounding.engineVersion,
    sourceResponseHash:grounding.sourceResponseHash,groundingHash:grounding.groundingHash,
   },
  },
 } as unknown as CharacterRuntimeContextWithGroundingV1;
 const perspective:CharacterPerspectiveProfileV1={
  schemaVersion:CHARACTER_PERSPECTIVE_SCHEMA_VERSION_V1,
  perspectiveVersion:'author-approved-v1',
  characterId:'taegyeom',sourceContentVersion:context.contentVersion,
  sourceSajuProfileVersion:context.sajuProfile.profileVersion,
  groundingAxisRegistryVersion:SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
  attentionBindings:[],attentionOrder:[],
  preferredNarrativeRoles:['primary','supporting','tension','limitation'],
  selection:{maxPrimaryUnits:2,maxSupportingUnits:1,maxTensionUnits:1,maxLimitationUnits:1,avoidSameAxisRepetition:true},
  interpretationBehavior:{contradictionHandling:'only_when_material',uncertaintyHandling:'state_directly',adviceStyle:'tradeoff_first'},
  deliveryAuthority:{speech:'published_character_speech',communication:'published_character_persona_communication',relationship:'active_relationship_projection'},
 };
 const issued={
  approvedComponent:'wealth',sajuDomain:'wealth',
  productResponseState:'delivered',readingId:ID,
  readerCharacterIds:['taegyeom'],
  readingSessionId:'22222222-2222-4222-8222-222222222222',
  readingContractVersion:'myeonghwa-product-reading-response-v2',
  completedAt:'2026-11-19T00:00:00Z',
  birthRevision:{issuedRevisionNo:1,currentRevisionNo:1,state:'current'},
  reading:{state:'delivered',reading:{readingId:ID,sections:[
   {sectionType:'wealth',title:'근거 해석',state:'complete',blocks:[{type:'paragraph',text:'확인된 공식 해석입니다.'}]},
   {sectionType:'wealth',title:'구조 분석',state:'complete',blocks:[{type:'paragraph',text:'검증된 구조입니다.'}]},
  ]}},
 } as OfficialReadingRecordV1;
 const verifiedBinding:SignedNativeReadingToIssuedRecordBindingV1={
  issuedReadingId:ID,issuedResponseHash:'sha256:v1:'+'a'.repeat(64),
  canonicalGroundingHash:grounding.groundingHash,
  nativeSourceResponseHash:'c'.repeat(64),nativeExecutionAttemptId:'saju-execution-proof-id',
 };
 return {issued,context,grounding,perspective,verifiedBinding};
}
describe('Signed native Saju -> existing Reader plan -> 6-chapter Luna product source',()=>{
 it('derives the product from EXACT existing selector and ReadingPlan instead of a handcrafted plan',()=>{
  const result=authorApprovedWealthProductSourceV1(fixture());
  expect(result?.chapters.map(x=>x.title)).toEqual([
   '돈복을 타고났을까?','돈은 어디에서 들어오는가','버는 돈과 남는 돈',
   '돈이 새어나가는 곳','당신의 특별한 돈 이야기 — 특별 심층 장','결국 돈을 남기는 사람은',
  ]);
  expect(result?.chapters[3]?.excerpts.join(' ')).toContain('실제 공식 Saju 의미 3');
  expect(result?.chapters[4]?.excerpts.join(' ')).toContain('실제 공식 Saju 의미 2');
 });
 it('refuses to complete a six-chapter paid product if the actual selection lacks a tension axis',()=>{
  const output=authorApprovedWealthProductSourceV1(fixture(['wealth','responsibility']));
  expect(output).toBeNull();
 });
 it('rejects source hash drift and cross-owner Reader identity',()=>{
  const input=fixture();
  expect(()=>authorApprovedWealthProductSourceV1({
   ...input,verifiedBinding:{...input.verifiedBinding,issuedResponseHash:'sha256:v1:'+'f'.repeat(64)},
  })).toThrow('origin');
  expect(()=>authorApprovedWealthProductSourceV1({
   ...input,issued:{...input.issued,readerCharacterIds:['seyeon']},
  })).toThrow('identity');
 });
});
