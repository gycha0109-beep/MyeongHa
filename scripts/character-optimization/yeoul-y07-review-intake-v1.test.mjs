import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildPrivateY07ReviewSheet} from './yeoul-y07-private-human-review-v1.mjs';
import {inspectPrivateY07ReviewSubmission,runLocalPrivateY07ReviewIntake} from './yeoul-y07-review-intake-v1.mjs';

const MODELS=['z-ai/glm-5.3-flash','deepseek/deepseek-v4.1-flash-1017','minimax/minimax-m3.1-flash','qwen/qwen3.8-27b'];
const VARIANTS=['baseline','language_rules','conversation_examples'];
const PRIVATE='PRIVATE_SYNTHETIC_NOTE_DO_NOT_LEAK';
function matrix(){
 const responses=[];
 for(let q=1;q<=12;q++)for(const model of MODELS)for(const variant of VARIANTS)for(const repeat of [1,2]){
  const id='Y'+String(q).padStart(2,'0');
  const bad=id==='Y07'&&model===MODELS[1];
  responses.push({id,model,variant,repeat,
   input:'SYNTHETIC_QUESTION_'+id+' '+PRIVATE,
   reply:'SYNTHETIC_REPLY_'+id+' '+PRIVATE,
   evaluation:{rating:bad?'soft':'good',note:bad?PRIVATE:'',details:[]},
   questionDiscrimination:null});
 }
 return {schemaVersion:'yeoul-evaluation-export-v1',experimentRunId:42572722295,
  scope:'all-288',sourceExperiment:{attemptedCalls:288,successfulCalls:288},
  responses,surveyState:{groups:{}}};
}
function edit(source, count=1,{complete=false,knownOriginalAutoFields=false}={}){
 const base=buildPrivateY07ReviewSheet(source,{knownOriginalAutoFields});
 const lines=base.split('\n');
 let start=-1;
 for(let n=0;n<count;n++){
  start=lines.indexOf('**사람 검토 판정 (직접 작성)**',start+1);
  if(start<0)throw Error('marker_missing');
  lines[start+2]='- [x] 인격·말투 불일치';
  const evidence=lines.indexOf('**관찰 근거(반드시 직접 작성):**',start+1);
  lines[evidence+2]='SYNTHETIC_HUMAN_EVIDENCE_'+n+'_'+PRIVATE;
 }
 if(complete)lines[lines.indexOf('**6건 검토 완료 여부:** - [ ] 미완료  - [ ] 전체 직접 확인')]='**6건 검토 완료 여부:** - [ ] 미완료  - [x] 전체 직접 확인';
 return lines.join('\n');
}
test('blank source sheet remains unreviewed and never approved',()=>{
 const source=matrix(),before=structuredClone(source);
 const report=inspectPrivateY07ReviewSubmission({source,
  markdown:buildPrivateY07ReviewSheet(source,{knownOriginalAutoFields:false}),
  knownOriginalAutoFields:false});
 assert.equal(report.historicalResponsesChecked,6);
 assert.equal(report.humanSelectionsProvided,0);
 assert.equal(report.pendingOrUndecidedResponses,6);
 assert.equal(report.ownerApprovalVerified,false);
 assert.equal(report.readyForPaidExperiment,false);
 assert.equal(report.externalCalls,0);
 assert.equal(JSON.stringify(report).includes(PRIVATE),false);
 assert.deepEqual(source,before);
});
test('partially reviewed entries are counted but never granted approval',()=>{
 const source=matrix(),md=edit(source,2);
 const report=inspectPrivateY07ReviewSubmission({source,markdown:md,knownOriginalAutoFields:false});
 assert.equal(report.humanSelectionsProvided,2);
 assert.equal(report.pendingOrUndecidedResponses,4);
 assert.equal(report.countsByCategory['인격·말투 불일치'],2);
 assert.equal(report.completionClaimIsAuthenticated,false);
 assert.equal(JSON.stringify(report).includes(PRIVATE),false);
});
test('six checked entries and completion marker do not verify owner or quality',()=>{
 const source=matrix(),md=edit(source,6,{complete:true});
 const report=inspectPrivateY07ReviewSubmission({source,markdown:md,knownOriginalAutoFields:false});
 assert.equal(report.humanSelectionsProvided,6);
 assert.equal(report.completionBoxMarked,true);
 assert.equal(report.ownerApprovalVerified,false);
 assert.equal(report.modelQualityGainEstablished,false);
 assert.equal(report.approvedExamplesForPrompt.length,0);
});
test('changes to archived question, answer or user rating text are rejected',()=>{
 const source=matrix(),md=edit(source,1);
 for(const changed of [md.replace('SYNTHETIC_REPLY_Y07','FORGED_REPLY_Y07'),
   md.replace('**기존 사용자 평가:** soft','**기존 사용자 평가:** good'),
   md.replace('SYNTHETIC_QUESTION_Y07','FORGED_QUESTION_Y07')]){
  assert.throws(()=>inspectPrivateY07ReviewSubmission({source,markdown:changed,knownOriginalAutoFields:false}),
    /archived_text_modified/);
 }
});
test('multiple choices, empty evidence and premature completion fail',()=>{
 const source=matrix(),md=edit(source,1);
 const double=md.replace('- [ ] 한국어·대화 자연스러움 문제','- [x] 한국어·대화 자연스러움 문제');
 assert.throws(()=>inspectPrivateY07ReviewSubmission({source,markdown:double,knownOriginalAutoFields:false}),
  /contradictory_human_marks/);
 const noEvidence=md.replace('SYNTHETIC_HUMAN_EVIDENCE_0_'+PRIVATE,'_미작성_');
 assert.throws(()=>inspectPrivateY07ReviewSubmission({source,markdown:noEvidence,knownOriginalAutoFields:false}),
  /selected_without_written_evidence/);
 const premature=edit(source,5,{complete:true});
 assert.throws(()=>inspectPrivateY07ReviewSubmission({source,markdown:premature,knownOriginalAutoFields:false}),
  /unverified_completion_claim/);
 const extra=md+'\nINJECTED';
 assert.throws(()=>inspectPrivateY07ReviewSubmission({source,markdown:extra,knownOriginalAutoFields:false}),
  /protected_line_count_changed/);
});
test('local adapter writes metadata-only once and rejects overwrites',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'yeoul-y07-local-test-'));
 try{
  const source=matrix(),src=join(directory,'source.json'),review=join(directory,'review.md'),output=join(directory,'summary.json');
  for(const row of source.responses.slice(0,36))row.questionDiscrimination='UNREVIEWED';
  source.surveyState.groups=Object.fromEntries(Array.from({length:9},(_,i)=>['group'+i,{discrimination:'UNREVIEWED'}]));
  await Promise.all([writeFile(src,JSON.stringify(source)),writeFile(review,edit(source,1,{knownOriginalAutoFields:true}))]);
  const outcome=await runLocalPrivateY07ReviewIntake({sourceFile:src,reviewFile:review,outputFile:output});
  const summary=JSON.parse(await readFile(output,'utf8'));
  assert.equal(outcome.reviewed,1);
  assert.equal(summary.ownerApprovalVerified,false);
  assert.equal(JSON.stringify(summary).includes(PRIVATE),false);
  await assert.rejects(runLocalPrivateY07ReviewIntake({sourceFile:src,reviewFile:review,outputFile:output}),/EEXIST/);
 } finally {await rm(directory,{recursive:true,force:true})}
});
