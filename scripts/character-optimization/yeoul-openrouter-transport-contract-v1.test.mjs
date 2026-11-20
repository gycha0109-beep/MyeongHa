import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPinnedYeoulChatPayload, inspectYeoulGenerationEvidence }
  from './yeoul-openrouter-transport-contract-v1.mjs';
import { YEOUL_STUDENT_MODEL } from './yeoul-openrouter-readonly-preflight-v1.mjs';

const args = { providerTag: 'deepseek', maxOutputTokens: 64,
  messages: [{role:'system',content:'캐릭터 규칙'}, {role:'user',content:'안녕하세요'}] };
const gen = { data: { id:'gen-123', model:YEOUL_STUDENT_MODEL,
  provider_name:'DeepSeek', is_byok:false, cancelled:false,
  native_tokens_prompt:20, native_tokens_completion:12, native_tokens_reasoning:0,
  num_fetches:0, num_search_results:0, num_media_prompt:0,
  num_media_completion:0, num_input_audio_prompt:0,
  native_tokens_completion_images:0, total_cost:0.00007 } };
const receipt = { completion:{id:'gen-123',model:YEOUL_STUDENT_MODEL},
  generation:gen, expectedProviderName:'DeepSeek', maxPromptTokens:64,
  maxCompletionTokens:64, maxReasoningTokens:0, reservedMicroUsd:200 };
const clone = v => structuredClone(v);

test('Pinned body is non-streaming, one ZDR provider, no alternate paid route',()=>{
  const b=buildPinnedYeoulChatPayload(args);
  assert.deepEqual(Object.keys(b).sort(), ['max_tokens','messages','model','provider','stream']);
  assert.equal(b.model,YEOUL_STUDENT_MODEL);
  assert.deepEqual(b.provider.only,['deepseek']);
  assert.equal(b.provider.allow_fallbacks,false);
  assert.equal(b.provider.zdr,true);
  assert.equal(b.provider.data_collection,'deny');
  assert.equal(b.stream,false);
  assert.ok(Object.isFrozen(b.provider.only));
  assert.ok(Object.isFrozen(b.messages[0]));
});

test('Payload rejects tool injection, invalid model role and excess output cap',()=>{
  assert.throws(()=>buildPinnedYeoulChatPayload({...args,maxOutputTokens:257}),/output_token_ceiling/);
  assert.throws(()=>buildPinnedYeoulChatPayload({...args,providerTag:'deepseek,other'}),/provider_tag_unverified/);
  assert.throws(()=>buildPinnedYeoulChatPayload({...args,messages:[...args.messages,{role:'tool',content:'x'}]}),/message_shape_or_tool_escape/);
  assert.throws(()=>buildPinnedYeoulChatPayload({...args,messages:[{role:'system',content:'x',tools:[]} ,args.messages[1]]}),/message_shape_or_tool_escape/);
  assert.throws(()=>buildPinnedYeoulChatPayload({...args,messages:[args.messages[1],args.messages[0]]}),/message_order/);
});

test('Generation metadata is only unverified cost evidence, not settlement permission',()=>{
  const result=inspectYeoulGenerationEvidence(receipt);
  assert.equal(result.reportedMicroUsdCeiling,70);
  assert.equal(result.budgetLedgerSettlementAllowed,false);
  assert.equal(result.transportApprovalAuthenticated,false);
  assert.equal(JSON.stringify(result).includes('캐릭터 규칙'),false);
});

test('Model, generation identity, provider and BYOK drift are rejected',()=>{
  for(const change of [
    v=>v.completion.id='gen-other',
    v=>v.completion.model='other/model',
    v=>v.generation.data.model='other/model',
    v=>v.generation.data.provider_name='Other',
    v=>v.generation.data.is_byok=true,
    v=>v.generation.data.cancelled=true,
  ]){const v=clone(receipt);change(v);assert.throws(()=>inspectYeoulGenerationEvidence(v),/untrusted_generation_identity/);}
});

test('Unknown billing, token overflow and extra metered components stay held',()=>{
  for(const change of [
    v=>v.generation.data.total_cost=null,
    v=>v.generation.data.total_cost=1,
    v=>v.generation.data.native_tokens_prompt=65,
    v=>v.generation.data.native_tokens_reasoning=1,
    v=>v.generation.data.num_fetches=1,
    v=>delete v.generation.data.num_search_results,
  ]){const v=clone(receipt);change(v);assert.throws(()=>inspectYeoulGenerationEvidence(v),/unknown_total_cost|cost_exceeds_usd_reservation|missing_or_excess_native_tokens|unpriced_generation_component/);}
});
