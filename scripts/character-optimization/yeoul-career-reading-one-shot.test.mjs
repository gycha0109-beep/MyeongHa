import test from 'node:test';import assert from 'node:assert/strict';
import {buildPlan,validateDraft,makeMessages} from './yeoul-career-reading-one-shot.mjs';
const src={sourceKind:'issued_official_saju_reading',readingId:'synthetic-test-id',domain:'career',state:'delivered',evidence:[{id:'career-01',text:'독립적인 판단과 업무 목표의 이해가 중요하게 드러난다는 가상의 검증용 근거입니다.',origin:'synthetic-test'},{id:'career-02',text:'스스로 일을 처리할 때 책임의 경계를 지켜야 한다는 가상의 검증용 근거입니다.',origin:'synthetic-test'},{id:'career-03',text:'명시된 커리어 시기별 근거는 제공되지 않았다는 가상의 검증용 근거입니다.',origin:'synthetic-test'}],limitations:['시기 예측 근거 없음']};
test('plan is one-shot only and no paid call',()=>{const p=buildPlan(src);assert.equal(p.requestedCalls,1);assert.equal(p.officialWriterCalls,0);assert.equal(p.productionEnabled,false);});
test('no fabricated official input',()=>{assert.throws(()=>buildPlan({...src,sourceKind:'invented'}));});
test('source is passed without editing and prompts include canonical evidence',()=>{const m=makeMessages(src);assert.match(m[1].content,/career-01/);assert.match(m[1].content,/시기 예측 근거 없음/);});
test('reject incomplete result',()=>assert.throws(()=>validateDraft(src,{chapters:[]})));
