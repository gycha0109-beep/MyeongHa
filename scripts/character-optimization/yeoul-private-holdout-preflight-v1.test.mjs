import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, symlink, stat, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { YEOUL_NEW_FAMILY_DRAFTS } from './yeoul-new-scenario-families-v1.mjs';
import { inspectPrivateYeoulHoldoutDraft, runPrivateYeoulHoldoutPreflight } from './yeoul-private-holdout-preflight-v1.mjs';

const mark='THIS_IS_PRIVATE_SCENARIO_DO_NOT_PRINT';
const draft=()=>({
 schemaVersion:'yeoul-private-holdout-draft-v1',characterId:'yeoul',
 datasetRole:'sealed_holdout',sourceClass:'owner_new_unexposed_unverified',
 families:[
  {familyId:'private-sealed-alpha',relationshipStage:'no_history',historyAvailable:false,
    turns:['아침마다 바람이 부는 정원에서 나무를 관찰했어요 '+mark]},
  {familyId:'private-sealed-beta',relationshipStage:'acquaintance',historyAvailable:false,
    turns:['빈 도시의 밤을 소재로 새로운 이야기를 짧게 쓰고 있어요 '+mark]},
 ]
});
const fixture288=()=>{
 const responses=[];
 const models=['z-ai/glm-5.3-flash','deepseek/deepseek-v4.1-flash-1017','minimax/minimax-m3.1-flash','qwen/qwen3.8-27b'];
 for(let i=1;i<=12;i++)for(const model of models)for(const variant of ['baseline','language_rules','conversation_examples'])
  for(const repeat of [1,2])responses.push({id:'Y'+String(i).padStart(2,'0'),model,variant,repeat,
    input:'과거 원본 검토를 위한 가상 질문 번호 '+i,reply:'가상 답변',
    questionDiscrimination:null,evaluation:{rating:'good',note:''}});
 return {schemaVersion:'yeoul-evaluation-export-v1',experimentRunId:42572722295,scope:'all-288',
  sourceExperiment:{attemptedCalls:288,successfulCalls:288},responses};
};
test('private holdout draft is only inspected, never admitted as independent quality evidence',()=>{
 const a=draft(),bytes=JSON.stringify(a);
 const s=inspectPrivateYeoulHoldoutDraft(a);
 assert.equal(s.privateFamiliesInspected,2);
 assert.equal(s.privateTurnsInspected,2);
 assert.equal(s.publishedComparisonGroupsChecked,18);
 assert.equal(s.legacyY01toY12Compared,false);
 for(const flag of ['independentSemanticReviewVerified','privateSourceAuthenticityVerified',
  'blindEvaluatorReady','holdoutAdmitted','optimizerCanReadHoldout','paidExecutionReady','ownerApprovalVerified'])
   assert.equal(s[flag],false);
 assert.equal(s.externalCalls,0);
 assert.equal(JSON.stringify(a),bytes);
 assert.ok(!JSON.stringify(s).includes(mark));
 assert.ok(!JSON.stringify(s).includes('private-sealed-alpha'));
});
test('publicly exposed H01-H10 and existing development/validation cannot be repackaged as sealed',()=>{
 const a=draft();
 a.families[0].turns=['우리 지난주에 같이 기차 타고 바다 보러 갔잖아요. 사진도 있죠?'];
 assert.throws(()=>inspectPrivateYeoulHoldoutDraft(a),/reused_published_scenario/);
 a.families[0].turns=[YEOUL_NEW_FAMILY_DRAFTS[1].turns[0]];
 assert.throws(()=>inspectPrivateYeoulHoldoutDraft(a),/reused_published_scenario/);
 a.families[0].familyId='H01';
 assert.throws(()=>inspectPrivateYeoulHoldoutDraft(a),/private_family_shape/);
});
test('falsified authority, data leakage fields, repeated turns and reused IDs are rejected',()=>{
 const a=draft();a.ownerApproved=true;
 assert.throws(()=>inspectPrivateYeoulHoldoutDraft(a),/private_holdout_draft_shape/);
 delete a.ownerApproved;a.families[0].userMessage='private';
 assert.throws(()=>inspectPrivateYeoulHoldoutDraft(a),/private_family_shape/);
 delete a.families[0].userMessage;
 a.families[1].turns=[...a.families[0].turns];
 assert.throws(()=>inspectPrivateYeoulHoldoutDraft(a),/reused_private_turn/);
 a.families[1].turns=['서로 다른 풍경을 위한 아주 새로운 산문을 써보겠습니다 '+mark];
 a.families[1].familyId=a.families[0].familyId;
 assert.throws(()=>inspectPrivateYeoulHoldoutDraft(a),/private_family_shape/);
});
test('near public and private overlap is flagged and still never approved',()=>{
 const a=draft();
 a.families[0].turns=['회사 사람하고 다퉜는데 제가 원래 이런 성격인 걸까요? 추가 조건'];
 const r=inspectPrivateYeoulHoldoutDraft(a);
 assert.equal(r.possiblePublishedOverlapFamilies,1);
 assert.equal(r.holdoutAdmitted,false);
 const b=draft();b.families[1].turns=[b.families[0].turns[0]+' 조금 다른 글자'];
 const s=inspectPrivateYeoulHoldoutDraft(b);
 assert.equal(s.possibleWithinDraftOverlapFamilies,1);
});
test('optional historic original validates 288 rows and only reports comparison counts',()=>{
 const x=fixture288(),a=draft();
 let s=inspectPrivateYeoulHoldoutDraft(a,{historicalOriginal:x});
 assert.equal(s.legacyY01toY12Compared,true);
 assert.equal(s.possibleHistoricalOverlapFamilies,0);
 const old=JSON.stringify(x);x.responses[0].input='변조된 원본';
 assert.throws(()=>inspectPrivateYeoulHoldoutDraft(a,{historicalOriginal:x}),/question_input_drift/);
 x.responses[0].input=JSON.parse(old).responses[0].input;
 a.families[0].turns=['과거 원본 검토를 위한 가상 질문 번호 1 와 다른 경우'];
 s=inspectPrivateYeoulHoldoutDraft(a,{historicalOriginal:x});
 assert.equal(s.possibleHistoricalOverlapFamilies,1);
 assert.equal(s.independentSemanticReviewVerified,false);
 assert.throws(()=>inspectPrivateYeoulHoldoutDraft(a,{knownOriginalAutoFields:true}),/private_holdout_draft_shape/);
});
test('local private file produces minimal new summary; overwrite and repository writes refused',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'yeoul-private-holdout-'));
 try {
  const a=draft(),data=JSON.stringify(a),source=join(folder,'draft.json');
  const report=join(folder,'summary.json'),original=join(folder,'historical.json');
  await writeFile(source,data);await writeFile(original,JSON.stringify(fixture288()));
  if(process.platform!=='win32'){await chmod(source,0o600);await chmod(original,0o600);}
  const s=await runPrivateYeoulHoldoutPreflight({privateDraft:source,privateSummary:report,privateOriginal:original});
  assert.equal(s.legacyY01toY12Compared,true);
  assert.equal(s.holdoutAdmitted,false);
  assert.equal(await readFile(source,'utf8'),data);
  const exported=await readFile(report,'utf8');
  assert.ok(!exported.includes(mark));assert.ok(!exported.includes('private-sealed-'));
  if(process.platform!=='win32')assert.equal((await stat(report)).mode&0o077,0);
  await assert.rejects(()=>runPrivateYeoulHoldoutPreflight({privateDraft:source,privateSummary:report}),/EEXIST/);
  const repoRoot=resolve(fileURLToPath(new URL('../../',import.meta.url)));
  await assert.rejects(()=>runPrivateYeoulHoldoutPreflight({
    privateDraft:source,privateSummary:join(repoRoot,'bad.json')}),/private_output_inside_repository/);
  const link=join(folder,'link.json'); await symlink(source,link);
  await assert.rejects(()=>runPrivateYeoulHoldoutPreflight({privateDraft:link,privateSummary:join(folder,'new.json')}),/private_input_not_regular/);
 }finally{await rm(folder,{recursive:true,force:true});}
});
