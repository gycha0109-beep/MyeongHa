import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildPrivateY07ReviewSheet, writePrivateY07ReviewSheet } from './yeoul-y07-private-human-review-v1.mjs';
const MODELS=['z-ai/glm-5.3-flash','deepseek/deepseek-v4.1-flash-1017',
 'minimax/minimax-m3.1-flash','qwen/qwen3.8-27b'];
const VARIANTS=['baseline','language_rules','conversation_examples'];
const MARKER='PRIVATE_REVIEW_TEST_SENTINEL';
const fixture=(badCount=6)=>{
 const responses=[];
 for(let n=1;n<=12;n++) for(const model of MODELS) for(const variant of VARIANTS) for(const repeat of [1,2]){
  const id='Y'+String(n).padStart(2,'0');
  const bad=id==='Y07'&&model===MODELS[1]&&badCount>0;
  if(bad)badCount--;
  responses.push({id,model,variant,repeat,
   input:'SYNTHETIC_QUESTION_'+id+'_'+MARKER,
   reply:'SYNTHETIC_ANSWER_'+id+'_'+MARKER,
   evaluation:{rating:bad?'soft':'good',note:bad?MARKER:'',details:[]},
   questionDiscrimination:null});
 }
 return {schemaVersion:'yeoul-evaluation-export-v1',experimentRunId:42572722295,
  scope:'all-288',sourceExperiment:{attemptedCalls:288,successfulCalls:288},
  responses,surveyState:{groups:{}}};
};
test('local Y07 sheet shows all six DeepSeek replies and leaves every human decision blank',()=>{
 const source=fixture(),before=structuredClone(source);
 const md=buildPrivateY07ReviewSheet(source,{knownOriginalAutoFields:false});
 assert.equal((md.match(/^## \d+\. Y07 ·/gmu)||[]).length,6);
 assert.equal((md.match(/\*\*당시 DeepSeek 응답\*\*/gu)||[]).length,6);
 assert.equal((md.match(/- \[ \] 판단 보류/gu)||[]).length,6);
 assert.equal((md.match(/\*\*관찰 근거\(반드시 직접 작성\)/gu)||[]).length,6);
 assert.equal(md.includes(MARKER),true);
 assert.equal(md.includes('사람 검토 판정'),true);
 assert.equal(md.includes('기존 사용자 평가'),true);
 assert.equal(md.includes('신규 모델 실행'),true);
 assert.equal(md.includes('- [x]'),false);
 assert.deepEqual(source,before);
});
test('incorrect Y07 results are not misrepresented as six failed samples',()=>{
 assert.throws(()=>buildPrivateY07ReviewSheet(fixture(5),{knownOriginalAutoFields:false}),
   /expected_six_actual_non_good_responses/);
});
test('archived-original format must explicitly enable the known 36+9 exclusion',()=>{
 const f=fixture();
 for(const row of f.responses.slice(0,36))row.questionDiscrimination='UNREVIEWED';
 f.surveyState.groups=Object.fromEntries(Array.from({length:9},(_,i)=>['group'+i,{discrimination:'UNREVIEWED'}]));
 const sheet=buildPrivateY07ReviewSheet(f);
 assert.equal(sheet.includes('Y07 기존 실패 6건'),true);
 assert.throws(()=>buildPrivateY07ReviewSheet(f,{knownOriginalAutoFields:false}),/private_row_contract/);
 f.responses[0].questionDiscrimination=null;
 assert.throws(()=>buildPrivateY07ReviewSheet(f),/unrecognized_original_auto_field_counts/);
});
test('cannot read or write private review inside repository',async()=>{
 await assert.rejects(
   writePrivateY07ReviewSheet({input:fileURLToPath(new URL('./yeoul-y07-private-human-review-v1.test.mjs',import.meta.url)),
     output:fileURLToPath(new URL('./PRIVATE_REVIEW.md',import.meta.url))}),
   /repository_boundary/);
});
