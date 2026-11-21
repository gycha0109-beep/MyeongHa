import test from 'node:test';import assert from 'node:assert/strict';
import {buildPlan,validateDraft,makeMessages} from './yeoul-career-reading-one-shot.mjs';
const src={sourceKind:'issued_official_saju_reading',readingId:'synthetic-test-id',domain:'career',state:'delivered',evidence:[{id:'career-01',text:'독립적인 판단과 업무 목표의 이해가 중요하게 드러난다는 가상의 검증용 근거입니다.',origin:'synthetic-test'},{id:'career-02',text:'스스로 일을 처리할 때 책임의 경계를 지켜야 한다는 가상의 검증용 근거입니다.',origin:'synthetic-test'},{id:'career-03',text:'명시된 커리어 시기별 근거는 제공되지 않았다는 가상의 검증용 근거입니다.',origin:'synthetic-test'}],limitations:['시기 예측 근거 없음']};
test('plan is one-shot only and no paid call',()=>{const p=buildPlan(src);assert.equal(p.requestedCalls,1);assert.equal(p.officialWriterCalls,0);assert.equal(p.productionEnabled,false);});
test('no fabricated official input',()=>{assert.throws(()=>buildPlan({...src,sourceKind:'invented'}));});
test('source is passed without editing and prompts include canonical evidence',()=>{const m=makeMessages(src);assert.match(m[1].content,/career-01/);assert.match(m[1].content,/시기 예측 근거 없음/);});
test('reject incomplete result',()=>assert.throws(()=>validateDraft(src,{chapters:[]})));

import {convertCareerSajuResearch} from './collect-yeoul-career-source.mjs';
const sourceResearch={sourceKind:'saju_engine_derived_research_only',productionIssuance:false,maySell:false,domain:'career',officialReportHash:'a'.repeat(64),official:{reportHash:'a'.repeat(64),sections:[{sectionId:'s1'}]},units:Array.from({length:3},(_,i)=>({id:'unit-'+i,claimId:'claim-'+i,category:'career',headline:'서술된 업무 성향',summary:'업무 특성과 조건에 관해 공식 근거가 설명하는 내용을 가상으로 제공하는 평가 자료입니다.',sourceRefs:['SRC-TEST']}))};
test('engine-derived research is never converted into issued official reading',()=>{const {source,manifest}=convertCareerSajuResearch(sourceResearch);const p=buildPlan(source);assert.equal(p.sourceKind,'saju_engine_derived_research_only');assert.equal(p.productionIssuance,false);assert.equal(manifest.unitCount,3);});
test('reject altered report hash',()=>assert.throws(()=>convertCareerSajuResearch({...sourceResearch,official:{reportHash:'b'.repeat(64),sections:[{}]}})));
test('reject research payload pretending to have production issuance',()=>assert.throws(()=>convertCareerSajuResearch({...sourceResearch,productionIssuance:true})));
