import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeHistoricalYeoulForOptimizer} from './yeoul-historical-bridge-v1.mjs';
const modes=['z-ai/glm-5.3-flash','deepseek/deepseek-v4.1-flash-1017','minimax/minimax-m3.1-flash','qwen/qwen3.8-27b'];
const variants=['baseline','language_rules','conversation_examples'];
function corpus(){const data=[];for(let i=1;i<=12;i++)for(const model of modes)for(const variant of variants)for(const repeat of [1,2]){
  const id=`Y${String(i).padStart(2,'0')}`,rating=(model.startsWith('deepseek')&&i<=6)?'awkward':'good';
  const row={id,model,variant,repeat,input:'PRIVATE_INPUT_SENTINEL',reply:'PRIVATE_REPLY_SENTINEL',evaluation:{rating,note:'PRIVATE_NOTE_SENTINEL'}};
  data.push({source:row,diagnostic:{originalKey:[id,variant,repeat,model].join('|'),originalRating:rating,
    classification:rating==='good'?'clean_positive_candidate':'negative_user_rating',reviewStatus:'unreviewed',
    evidence:rating==='good'?[]:[{tag:'korean_naturalness',origin:'user_rating',evidence:'PRIVATE_NOTE_SENTINEL'}]}});
}return data;}
test('private historical 288 adapted to 72 DeepSeek diagnoses without raw dialogue',()=>{const result=summarizeHistoricalYeoulForOptimizer({records:corpus(),experimentRunId:42572722295});assert.equal(result.legacyRows,288);assert.equal(result.studentRows,72);assert.equal(result.byQuestion.Y01.count,6);assert.equal(result.byVariant.baseline.count,24);assert.equal(result.diagnosticSignals.korean_naturalness.user_rating,36);assert.equal(result.humanReviewApprovedCount,0);const json=JSON.stringify(result);for(const value of ['PRIVATE_INPUT_SENTINEL','PRIVATE_REPLY_SENTINEL','PRIVATE_NOTE_SENTINEL'])assert.ok(!json.includes(value));});
test('duplicate key rejected',()=>{const rows=corpus();rows[1]=rows[0];assert.throws(()=>summarizeHistoricalYeoulForOptimizer({records:rows,experimentRunId:42572722295}),/source_key_or_duplicate/)});
test('review status cannot be promoted by arbitrary JSON',()=>{const rows=corpus();rows[0].diagnostic.reviewStatus='approved';assert.throws(()=>summarizeHistoricalYeoulForOptimizer({records:rows,experimentRunId:42572722295}),/unexpected_review_authority/)});
test('unknown evaluation source is rejected',()=>{const rows=corpus();rows[0].diagnostic.evidence=[{tag:'a',origin:'untrusted_model_summary',evidence:'x'}];assert.throws(()=>summarizeHistoricalYeoulForOptimizer({records:rows,experimentRunId:42572722295}),/evidence_origin/)});