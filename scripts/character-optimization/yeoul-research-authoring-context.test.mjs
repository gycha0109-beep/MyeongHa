import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeMessages,validateResearchAuthoringContext,buildYeoulEditorialLens,buildPlan} from './yeoul-career-reading-one-shot.mjs';
const src={
 sourceKind:'saju_engine_derived_research_only',state:'research_only',productionIssuance:false,domain:'career',
 readingId:'research-'+('a'.repeat(16)),officialReportHash:'a'.repeat(64),
 limitations:['Official issuance prohibited'],
 evidence:[
  {id:'natal-01',kind:'natal',text:'책임과 기준이 명확한 구조를 편하게 느낄 수 있습니다. 일정의 관리 조건이 중요합니다.',origin:'claim-A;canonical_reading_unit_A;SRC'},
  {id:'natal-02',kind:'natal',text:'기존 방식을 개선하려는 흐름이 나타납니다. 결과를 드러낼 수 있는 상황에 적합합니다.',origin:'claim-B;canonical_reading_unit_B;SRC'},
  {id:'natal-03',kind:'natal',text:'여러 자원을 분배할 수 있는 환경을 선호할 수 있습니다. 상황에 따라 우선순위를 살핍니다.',origin:'claim-C;canonical_reading_unit_C;SRC'},
 ],
};
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function context(){
 const units=src.evidence.map((e,i)=>({
  evidenceId:e.id,claimId:['claim-A','claim-B','claim-C'][i],
  canonicalUnitId:'canonical_reading_unit_'+['A','B','C'][i],title:e.text.split('. ')[0]+'.',
  summary:e.text.split('. ')[1],taxonomy:{category:'career',subcategory:i===1?'ten_god_visible_stems':'ten_god_branches'},
  semanticKey:['T8:career:JEONG_GWAN','T8:career:SANG_GWAN','T8:career:PYEON_JAE'][i],qualifiers:[],prohibitedExtensions:[],
  sourceRefs:['SRC'],relatedFactRefs:[],
 }));
 return {schemaVersion:'saju-career-research-authoring-context-v1',sourceKind:'saju_engine_derived_research_context_only',
 researchOnly:true,officialIssuance:false,sourceHash:sha(src),readingId:src.readingId,officialReportHash:src.officialReportHash,
 sourceSemanticHash:'b'.repeat(64),units,linkedCanonicalFacts:[],relations:[]};
}
test('research context is exact-source matched and stays research only',()=>{
 const c=context();assert.equal(validateResearchAuthoringContext(src,c),c);
 const lens=buildYeoulEditorialLens(src,c);
 assert.deepEqual(lens.candidateContrast.evidenceIds,['natal-01','natal-02']);
 assert.match(lens.candidateContrast.qualification,/승인됐다는 뜻이 아닙니다/);
 const msgs=makeMessages(src,c);
 const payload=JSON.parse(msgs[1].content);
 assert.equal(payload.sourceOwnedResearchContext.natal.length,3);
 assert.equal(payload.yeoulEditorialLens.sourceUnitGroups.underlying.length,2);
 assert.equal(payload.sourceMaterial.evidence.length,3);
 assert.equal(buildPlan(src).requestedCalls,1);
});
test('source swap, forged report, invented unit, stale claim and official context fail closed',()=>{
 for(const key of ['sourceHash','readingId','officialReportHash','sourceSemanticHash']){
  const c=context();c[key]='INVALID';assert.throws(()=>validateResearchAuthoringContext(src,c));
 }
 const badUnit=context();badUnit.units[0].claimId='made-up';assert.throws(()=>validateResearchAuthoringContext(src,badUnit));
 const badRef=context();badRef.units[0].relatedFactRefs=['unlinked'];assert.throws(()=>validateResearchAuthoringContext(src,badRef));
 assert.throws(()=>validateResearchAuthoringContext({...src,sourceKind:'issued_official_saju_reading',state:'delivered'},context()));
});
test('without optional authoring context the original single DeepSeek request shape is preserved',()=>{
 const msg=JSON.parse(makeMessages(src)[1].content);
 assert.equal(msg.yeoulEditorialLens,null);
 assert.equal(msg.sourceOwnedResearchContext,null);
 assert.equal(msg.sourceMaterial.evidence.length,3);
 assert.equal(buildPlan(src).model,'deepseek/deepseek-v4.1-flash-1017');
});
