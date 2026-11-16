import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildHistoricalYeoulAB,summarizeHistoricalYeoulAB} from '../../research/character-optimization-gepa/yeoul_historical_variant_ab_v1.mjs';
const models=['z-ai/glm-5.3-flash','deepseek/deepseek-v4.1-flash-1017',
 'minimax/minimax-m3.1-flash','qwen/qwen3.8-27b'];
const variants=['baseline','language_rules','conversation_examples'];
const sha=x=>createHash('sha256').update(x).digest('hex');
function fixture(){
 const responses=[];
 for(let n=1;n<=12;n++)for(const model of models)for(const variant of variants)for(const repeat of [1,2]){
  const id='Y'+String(n).padStart(2,'0');
  const good=variant==='baseline'?repeat===1:variant==='language_rules'?n%2===0:n%3===0;
  responses.push({id,model,variant,repeat,input:'가상 질문 '+id,
   reply:'비공개 응답 '+id+' '+repeat+' '+variants.indexOf(variant)+(n===1&&repeat===1?'<script>fake()</script>':''),
   evaluation:{rating:good?'good':'awkward',note:'PRIVATE_NOTE_123'},
   questionDiscrimination:null});
 }
 return {schemaVersion:'yeoul-evaluation-export-v1',experimentRunId:42572722295,
  scope:'all-288',sourceExperiment:{attemptedCalls:288,successfulCalls:288},responses};
}
function reviewFor(keyFile,kind='challenger'){
 return {schemaVersion:'yeoul-historical-variant-ab-human-review-v1',
  keyFingerprint:sha(JSON.stringify(keyFile)),
  reviews:keyFile.pairs.map((p,i)=>({
   id:p.id,vote:i===0?'tie':i===1?'uncertain':i===2?null:
    kind==='challenger'?(p.baselineSide==='A'?'B':'A'):p.baselineSide,
   issueAxis:i<3?null:'persona_fidelity',note:'PRIVATE_VOTE_NOTE'
  }))};
}
test('48 real-pair structure is blind, immutable and development-only',()=>{
 const original=fixture(),before=JSON.stringify(original);
 const b=buildHistoricalYeoulAB(original,{chooseSide:()=>0});
 assert.equal(JSON.stringify(original),before);
 assert.equal(b.keyFile.pairs.length,48);
 assert.equal(new Set(b.keyFile.pairs.map(p=>p.id)).size,48);
 assert.equal(b.summary.pairs,48);
 assert.equal(b.summary.variants.language_rules.pairs,24);
 assert.equal(b.summary.variants.conversation_examples.pairs,24);
 assert.equal(b.summary.measuredGepaGain,false);
 assert.equal(b.summary.independentHoldout,false);
 assert.equal(b.summary.realNewModelCalls,0);
 assert.doesNotMatch(b.html,/language_rules|conversation_examples|PRIVATE_NOTE_123|baselineSide/);
 assert.match(b.html,/&lt;script&gt;fake\(\)&lt;\/script&gt;/);
 assert.doesNotMatch(b.html,/<script>fake\(\)<\/script>/);
 assert.match(b.html,/data-id="P001"/);
});
test('historical rating differences and actual human votes stay separate',()=>{
 const original=fixture(),b=buildHistoricalYeoulAB(original,{chooseSide:()=>1});
 const r=summarizeHistoricalYeoulAB(original,b.keyFile,reviewFor(b.keyFile));
 assert.equal(r.reviewed,47);assert.equal(r.unreviewed,1);
 assert.equal(r.challengerWins,45);assert.equal(r.baselineWins,0);
 assert.equal(r.ties,1);assert.equal(r.uncertain,1);
 assert.equal(r.byVariant.language_rules.reviewed+r.byVariant.conversation_examples.reviewed,47);
 assert.equal(r.historical.pairs,48);
 assert.equal(r.measuredGepaGain,false);assert.equal(r.productionEligible,false);
 assert.doesNotMatch(JSON.stringify(r),/PRIVATE_NOTE_123|PRIVATE_VOTE_NOTE|가상 질문/);
});
test('tampered source, pair key or fake approval cannot be re-used',()=>{
 const original=fixture(),b=buildHistoricalYeoulAB(original,{chooseSide:()=>0});
 const r=reviewFor(b.keyFile);
 const changed=structuredClone(original);
 changed.responses.find(x=>x.model==='deepseek/deepseek-v4.1-flash-1017').reply+='tampered';
 assert.throws(()=>summarizeHistoricalYeoulAB(changed,b.keyFile,r),/reply_binding/);
 const alteredKey=structuredClone(b.keyFile);
 alteredKey.pairs[0].baselineSide='B';
 const updated=reviewFor(alteredKey);
 assert.throws(()=>summarizeHistoricalYeoulAB(original,alteredKey,updated),/reply_binding/);
 const fake=structuredClone(b.keyFile);
 fake.developmentOnly=false;
 assert.throws(()=>summarizeHistoricalYeoulAB(original,fake,reviewFor(fake)),/review_contract/);
});
test('invalid vote, duplicate rows, and unpaired source are rejected',()=>{
 const original=fixture(),b=buildHistoricalYeoulAB(original,{chooseSide:()=>0});
 const bad=reviewFor(b.keyFile);
 bad.reviews[3].vote='candidate_wins';
 assert.throws(()=>summarizeHistoricalYeoulAB(original,b.keyFile,bad),/vote_contract/);
 const bad2=reviewFor(b.keyFile);
 bad2.reviews[2].issueAxis='agency';
 assert.throws(()=>summarizeHistoricalYeoulAB(original,b.keyFile,bad2),/vote_contract/);
 const bad3=reviewFor(b.keyFile);
 bad3.reviews[1].id=bad3.reviews[0].id;
 assert.throws(()=>summarizeHistoricalYeoulAB(original,b.keyFile,bad3),/vote_contract/);
 const incomplete=structuredClone(original);incomplete.responses.pop();
 assert.throws(()=>buildHistoricalYeoulAB(incomplete),/YEOUL_PRIVATE_INTAKE_INVALID/);
});
