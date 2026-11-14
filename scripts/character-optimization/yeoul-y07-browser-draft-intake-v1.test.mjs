import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { inspectPrivateY07BrowserDraft, runLocalY07BrowserDraftIntake } from './yeoul-y07-browser-draft-intake-v1.mjs';
import { buildPrivateY07BrowserReview } from './yeoul-y07-private-browser-review-v1.mjs';

const MODELS=['z-ai/glm-5.3-flash','deepseek/deepseek-v4.1-flash-1017',
 'minimax/minimax-m3.1-flash','qwen/qwen3.8-27b'];
const VARIANTS=['baseline','language_rules','conversation_examples'];
const CASES=['baseline:1','baseline:2','language_rules:1','language_rules:2',
 'conversation_examples:1','conversation_examples:2'];
const PRIVATE='PRIVATE_Y07_NOTE_NEVER_IN_SUMMARY';
function matrix(){
 const responses=[];
 for(let n=1;n<=12;n++)for(const model of MODELS)for(const variant of VARIANTS)
  for(const repeat of [1,2]){
   const id='Y'+String(n).padStart(2,'0');
   const bad=id==='Y07'&&model===MODELS[1];
   responses.push({id,model,variant,repeat,
     input:'SYNTHETIC_INPUT_'+id+'_'+PRIVATE,
     reply:'SYNTHETIC_REPLY_'+id+'_'+PRIVATE,
     evaluation:{rating:bad?'soft':'good',note:bad?PRIVATE:'',details:[]},
     questionDiscrimination:null});
  }
 const groups=Object.fromEntries(Array.from({length:9},(_,i)=>['group'+i,{discrimination:'UNREVIEWED'}]));
 for(const row of responses.slice(0,36))row.questionDiscrimination='UNREVIEWED';
 return {schemaVersion:'yeoul-evaluation-export-v1',experimentRunId:42572722295,
   scope:'all-288',sourceExperiment:{attemptedCalls:288,successfulCalls:288},
   responses,surveyState:{groups}};
}
function draft(){
 const decisions=CASES.map(key=>({key,decision:'pending',evidence:'',direction:''}));
 return {schemaVersion:'yeoul-y07-private-human-review-draft-v1',
   sourceExperimentRunId:42572722295,datasetRole:'historical_development_only',
   characterId:'yeoul',modelId:MODELS[1],questionId:'Y07',
   decisions,enteredCount:0,allEntriesEntered:false,
   reviewerAuthorityVerified:false,ownerApproved:false,
   canonViolationConfirmed:false,independentQualityGainEstablished:false,
   externalCalls:0,productionEligible:false};
}
test('actual browser draft schema is reusable by existing source-locked review intake',()=>{
 const source=matrix(),before=structuredClone(source),data=draft();
 const browser=buildPrivateY07BrowserReview(source);
 assert.ok(browser.includes("allEntriesEntered:completed===6"));
 const result=inspectPrivateY07BrowserDraft({source,draft:data});
 assert.equal(result.browserEntriesImported,6);
 assert.equal(result.reviewedCount,0);
 assert.equal(result.pendingOrUndecidedResponses,6);
 assert.equal(result.originalConversationOrHumanNotesExported,false);
 assert.equal(JSON.stringify(result).includes(PRIVATE),false);
 assert.deepEqual(source,before);
});
test('two human entries map to the canonical Markdown case evidence without granting approval',()=>{
 const data=draft();
 data.decisions[0]={key:'baseline:1',decision:'persona',
   evidence:'First line\nsecond line '+PRIVATE,direction:'Use fewer friendly phrases'};
 data.decisions[1]={key:'baseline:2',decision:'excessive_softness',
   evidence:'Too soft, source note '+PRIVATE,direction:''};
 data.enteredCount=2;
 const result=inspectPrivateY07BrowserDraft({source:matrix(),draft:data});
 assert.equal(result.reviewedCount,2);
 assert.equal(result.pendingOrUndecidedResponses,4);
 assert.equal(result.countsByCategory['인격·말투 불일치'],1);
 assert.equal(result.countsByCategory['과도한 부드러움 또는 공격성'],1);
 assert.equal(result.byCase[0].status,'review_submitted_unverified');
 assert.equal(result.ownerApprovalVerified,false);
 assert.equal(result.externalCalls,0);
 assert.equal(JSON.stringify(result).includes(PRIVATE),false);
});
test('hold requires actual evidence and counts as undecided, never as quality approval',()=>{
 const data=draft();
 data.decisions[0].decision='hold';
 data.enteredCount=1;
 assert.throws(()=>inspectPrivateY07BrowserDraft({source:matrix(),draft:data}),
   /decision_requires_evidence/);
 data.decisions[0].evidence='Need separate source comparison';
 const result=inspectPrivateY07BrowserDraft({source:matrix(),draft:data});
 assert.equal(result.browserSelectionsEntered,1);
 assert.equal(result.reviewedCount,0);
 assert.equal(result.pendingOrUndecidedResponses,6);
 assert.equal(result.ownerApprovalVerified,false);
});
test('six entered decisions are not authority, independent holdout, or full 30-item approval',()=>{
 const data=draft();
 for(const d of data.decisions){d.decision='no_issue_on_review';d.evidence='Observed synthetic only';}
 data.enteredCount=6;data.allEntriesEntered=true;
 const result=inspectPrivateY07BrowserDraft({source:matrix(),draft:data});
 assert.equal(result.reviewedCount,6);
 assert.equal(result.pendingOrUndecidedResponses,0);
 assert.equal(result.ownerApprovalVerified,false);
 assert.equal(result.newConfidentialHoldoutVerified,false);
 assert.equal(result.productionEligible,false);
 assert.equal(result.readyForPaidExperiment,false);
});
test('forged approval, modified status, reordered duplicates or malformed notes fail closed',()=>{
 const source=matrix(),x=draft();
 for(const mutate of [
  d=>{d.ownerApproved=true;},
  d=>{d.extraApprovedBy='owner';},
  d=>{d.decisions[0].key='Y08:1';},
  d=>{d.decisions.reverse();},
  d=>{d.decisions[0].decision='approved_for_prompt';},
  d=>{d.decisions[0].direction='_미작성_';},
  d=>{d.enteredCount=6;},
  d=>{d.decisions[0].evidence='\u0000ILLEGAL';}
 ]){
  const copy=structuredClone(x);mutate(copy);
  assert.throws(()=>inspectPrivateY07BrowserDraft({source,draft:copy}),/YEOUL_Y07_BROWSER_DRAFT_INTAKE_INVALID/);
 }
});
test('real local files produce only metadata once, outside the repo',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'yeoul-y07-browser-draft-'));
 try{
  const src=join(folder,'private-source.json'),draftPath=join(folder,'private-review.json'),out=join(folder,'metadata.json');
  const original=JSON.stringify(matrix());
  await writeFile(src,original,'utf8');
  await writeFile(draftPath,JSON.stringify(draft()),'utf8');
  const saved=await runLocalY07BrowserDraftIntake({sourceFile:src,draftFile:draftPath,outputFile:out});
  const result=JSON.parse(await readFile(out,'utf8'));
  assert.equal(saved.ownerApprovalVerified,false);
  assert.equal(saved.externalCalls,0);
  assert.equal(result.reviewedCount,0);
  assert.equal(JSON.stringify(result).includes(PRIVATE),false);
  assert.equal(await readFile(src,'utf8'),original);
  await assert.rejects(runLocalY07BrowserDraftIntake({sourceFile:src,draftFile:draftPath,outputFile:out}),/EEXIST/);
 }finally{await rm(folder,{recursive:true,force:true});}
});
