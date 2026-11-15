import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildPrivateY07BrowserReview, writePrivateY07BrowserReview } from './yeoul-y07-private-browser-review-v1.mjs';

const MODELS=['z-ai/glm-5.3-flash','deepseek/deepseek-v4.1-flash-1017',
  'minimax/minimax-m3.1-flash','qwen/qwen3.8-27b'];
const VARIANTS=['baseline','language_rules','conversation_examples'];
const MALICIOUS='</pre><script>alert("LEAK")</script><img src="https://example.com/track">';
const fixture = ({originalAuto=false,oneGoodY07=false}={}) => {
  const responses=[];
  for(let n=1;n<=12;n++)for(const model of MODELS)
    for(const variant of VARIANTS)for(const repeat of [1,2]){
      const id='Y'+String(n).padStart(2,'0');
      const y07=id==='Y07'&&model===MODELS[1];
      responses.push({
        id,model,variant,repeat,
        input:'PRIVATE_QUESTION_'+id+'<unsafe>',
        reply:y07 ? 'PRIVATE_REPLY_'+MALICIOUS : 'PRIVATE_REPLY_OTHER',
        evaluation:{rating:y07&&!(oneGoodY07&&variant==='baseline'&&repeat===1)?'soft':'good',
          note:y07?'PRIVATE_NOTE_'+MALICIOUS:'',details:[]},
        questionDiscrimination:null
      });
    }
  const surveyState={groups:{}};
  if(originalAuto){
    for(const row of responses.slice(0,36))row.questionDiscrimination='unreviewed';
    surveyState.groups=Object.fromEntries(Array.from({length:9},(_,i)=>
      ['group'+i,{discrimination:'unreviewed'}]));
  }
  return {schemaVersion:'yeoul-evaluation-export-v1',experimentRunId:42572722295,
    scope:'all-288',sourceExperiment:{attemptedCalls:288,successfulCalls:288},
    responses,surveyState};
};
test('render six source-backed local review forms without executable private input',()=>{
 const data=fixture(),before=structuredClone(data);
 const out=buildPrivateY07BrowserReview(data,{knownOriginalAutoFields:false});
 assert.equal((out.match(/data-case=/gu)||[]).length,6);
 assert.equal((out.match(/<summary>당시 질문·응답·사용자 의견 확인<\/summary>/gu)||[]).length,6);
 assert.equal((out.match(/<select data-field="decision"/gu)||[]).length,6);
 assert.equal((out.match(/<textarea data-field="evidence"/gu)||[]).length,6);
 assert.ok(out.includes('PRIVATE_REPLY_&lt;/pre&gt;&lt;script&gt;'));
 assert.equal(out.includes(MALICIOUS),false);
 assert.ok(out.includes('connect-src &#39;none&#39;')||out.includes("connect-src 'none'"));
 assert.ok(out.includes("ownerApproved:false"));
 assert.ok(out.includes("externalCalls:0"));
 assert.ok(!out.includes('http://example.com/track'));
 assert.deepEqual(data,before);
});
test('Y07 mixed quality history cannot be represented as all failed',()=>{
 assert.throws(()=>buildPrivateY07BrowserReview(fixture({oneGoodY07:true}),{knownOriginalAutoFields:false}),
 /expected_six_actual_non_good_responses/);
});
test('original auto fields are excluded only by opt-in private source validation',()=>{
 const src=fixture({originalAuto:true});
 assert.ok(buildPrivateY07BrowserReview(src).includes('PRIVATE_REPLY_'));
 assert.throws(()=>buildPrivateY07BrowserReview(src,{knownOriginalAutoFields:false}),
 /private_row_contract/);
 src.responses[0].questionDiscrimination=null;
 assert.throws(()=>buildPrivateY07BrowserReview(src),/unrecognized_original_auto_field_counts/);
});
test('local output is outside git, non-overwriting, and keeps input unmodified',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'myeongha-private-y07-'));
 try {
   const input=join(dir,'historical-private.json'),output=join(dir,'y07-private-review.html');
   const json=JSON.stringify(fixture({originalAuto:true}));
   await writeFile(input,json,'utf8');
   const created=await writePrivateY07BrowserReview({input,output});
   const produced=await readFile(output,'utf8');
   assert.equal(created.rows,6);
   assert.equal(created.humanApprovalVerified,false);
   assert.equal(created.externalCalls,0);
   assert.ok(produced.includes('PRIVATE_REPLY_'));
   assert.equal(await readFile(input,'utf8'),json);
   await assert.rejects(writePrivateY07BrowserReview({input,output}),/EEXIST/);
 } finally { await rm(dir,{recursive:true,force:true}); }
});
test('repository output and source are never admitted',async()=>{
 const local=fileURLToPath(new URL('./yeoul-y07-private-browser-review-v1.test.mjs',import.meta.url));
 await assert.rejects(writePrivateY07BrowserReview({input:local,output:local+'.html'}),
 /repository_boundary/);
});
