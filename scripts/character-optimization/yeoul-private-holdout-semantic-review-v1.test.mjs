import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {preparePrivateYeoulForResearch} from './yeoul-private-source-intake-v1.mjs';
import {buildPrivateYeoulSemanticReview,inspectPrivateYeoulSemanticReview} from './yeoul-private-holdout-semantic-review-v1.mjs';
const modelIds=['z-ai/glm-5.3-flash','deepseek/deepseek-v4.1-flash-1017','minimax/minimax-m3.1-flash','qwen/qwen3.8-27b'];
const variants=['baseline','language_rules','conversation_examples'];
const privateMarker='SECRET_PRIVATE_HOLDOUT_TEST';
function fixture(){
 const responses=[];
 for(let i=1;i<=12;i++)for(const model of modelIds)for(const variant of variants)for(const repeat of [1,2])
  responses.push({id:'Y'+String(i).padStart(2,'0'),input:'합성 원본 개발 질문 '+i+' 일관된 상태입니다',
   model,variant,repeat,reply:'합성 모델 대답',questionDiscrimination:null,
   evaluation:{rating:'good',note:'PRIVATE_LEGACY_FEEDBACK'}});
 const original={schemaVersion:'yeoul-evaluation-export-v1',experimentRunId:42572722295,
  scope:'all-288',sourceExperiment:{attemptedCalls:288,successfulCalls:288},responses};
 preparePrivateYeoulForResearch(original);
 const families=Array.from({length:10},(_,i)=>({
  familyId:'private-sealed-case'+String(i+1).padStart(2,'0'),
  relationshipStage:'no_history',historyAvailable:false,
  turns:['확인하지 않은 정보를 있는 것처럼 말하지 말아요. '+i+'번째 분기 '+privateMarker]
 }));
 const draft={schemaVersion:'yeoul-private-holdout-draft-v1',characterId:'yeoul',
  datasetRole:'sealed_holdout',sourceClass:'assistant_new_unexposed_unverified',families};
 return {original,draft};
}
test('real local reviewer page contains all ten new scenarios and 30 comparisons but no remote resources',()=>{
 const {draft,original}=fixture();
 const res=buildPrivateYeoulSemanticReview({draft,original});
 assert.equal(res.candidateCount,10);
 assert.equal(res.referenceCount,30);
 assert.equal((res.html.match(/<article data-id=/g)||[]).length,10);
 assert.ok(res.html.includes(privateMarker));
 assert.ok(!res.html.includes('https://'));
 assert.ok(!res.html.includes('PRIVATE_LEGACY_FEEDBACK'));
 assert.match(res.sourceFingerprint,/^[a-f0-9]{64}$/);
 assert.match(res.html,/independentSemanticReviewVerified|독립 최종평가 승인/);
});
test('review fields are source-bound and never imply independent evaluation or leak notes',()=>{
 const {draft,original}=fixture();
 const {sourceFingerprint}=buildPrivateYeoulSemanticReview({draft,original});
 const entries=draft.families.map((f,i)=>({id:f.familyId,decision:i===0?'distinct':i===1?'overlap':null,
  overlapReference:i===1?'Y01':null,note:i<2?'검토 근거 '+privateMarker:''}));
 const review={schemaVersion:'yeoul-private-holdout-human-review-draft-v1',sourceFingerprint,entries};
 const output=inspectPrivateYeoulSemanticReview({draft,original,review});
 assert.equal(output.reviewed,2);
 assert.equal(output.counts.distinct,1);assert.equal(output.counts.overlap,1);
 assert.equal(output.counts.unreviewed,8);
 assert.equal(output.independentSemanticReviewVerified,false);
 assert.equal(output.sealedHoldoutAdmitted,false);
 assert.doesNotMatch(JSON.stringify(output),/PRIVATE|Y01|private-sealed-case/);
 const bad={...review,sourceFingerprint:'a'.repeat(64)};
 assert.throws(()=>inspectPrivateYeoulSemanticReview({draft,original,review:bad}),/unbound_review/);
 const changed=structuredClone(draft);changed.families[0].turns[0]+='다른 글자';
 assert.throws(()=>inspectPrivateYeoulSemanticReview({draft:changed,original,review}),/unbound_review/);
});
test('duplicate votes, missing reasons and fabricated source approval never pass',()=>{
 const {draft,original}=fixture();
 const {sourceFingerprint}=buildPrivateYeoulSemanticReview({draft,original});
 const entries=draft.families.map(f=>({id:f.familyId,decision:null,overlapReference:null,note:''}));
 const r={schemaVersion:'yeoul-private-holdout-human-review-draft-v1',sourceFingerprint,entries};
 const bad={...r,entries:entries.map((e,i)=>i===0?{...e,decision:'distinct'}:e)};
 assert.throws(()=>inspectPrivateYeoulSemanticReview({draft,original,review:bad}),/invalid_review_entry/);
 const duplicate={...r,entries:entries.map((e,i)=>i===1?entries[0]:e)};
 assert.throws(()=>inspectPrivateYeoulSemanticReview({draft,original,review:duplicate}),/invalid_review_entry/);
 const unbound={...r,ownerApproved:true};
 assert.throws(()=>inspectPrivateYeoulSemanticReview({draft,original,review:unbound}),/unbound_review/);
 // Explicit approval claims must not enter the accepted reviewed-draft schema.
 const modified={...draft,sourceClass:'owner_approved'};
 assert.throws(()=>buildPrivateYeoulSemanticReview({draft:modified,original}),/private_holdout_draft_shape/);
});