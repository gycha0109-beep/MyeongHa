import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectYeoulOpenRouterEndpointEvidence} from './yeoul-provider-evidence-v1.mjs';

const modelId = 'deepseek/deepseek-v4.1-flash-1017';
const entry = () => ({model_id:modelId, provider_name:'Synthetic DeepSeek', tag:'fake-deepseek',
  status:0, max_prompt_tokens:8192, max_completion_tokens:2048,
  supported_parameters:['max_tokens','response_format'],
  pricing:{prompt:'0.00000015',completion:'0.0000006',request:'0'}});
const inputs = () => ({modelId, providerTag:'fake-deepseek',
  modelEndpointSnapshot:{data:{id:modelId,endpoints:[entry()]}},
  zdrEndpointSnapshot:{data:[entry()]},
  capturedAtEpoch:2000000000, evaluatedAtEpoch:2000000010, maxAgeSeconds:3600,
  requiredParameters:['max_tokens','response_format'], maxInputTokens:500,maxOutputTokens:200});

test('two untrusted matching endpoint snapshots yield only a nonauthorizing arithmetic subtotal',()=>{
 const report=inspectYeoulOpenRouterEndpointEvidence(inputs());
 assert.equal(report.promptCompletionRequestOnlyQuoteMicroUsd,'195');
 assert.deepEqual(report.providerRoutingCandidate.only,['fake-deepseek']);
 assert.equal(report.providerZdrDirectoryMatched,true);
 assert.equal(report.pricingCompleteAndAuthoritative,false);
 assert.equal(report.externalCallsAuthorized,false);
 assert.equal(report.paidExecutionReady,false);
 assert.equal(report.unknownBillableCategoriesExcluded,true);
});

test('absence or ambiguous identity in ZDR and provider endpoint listings blocks',()=>{
 const a=inputs();a.zdrEndpointSnapshot.data=[];
 assert.throws(()=>inspectYeoulOpenRouterEndpointEvidence(a),/zdr_endpoint_absent/);
 const b=inputs();b.modelEndpointSnapshot.data.endpoints.push(entry());
 assert.throws(()=>inspectYeoulOpenRouterEndpointEvidence(b),/unique_provider_endpoint/);
 const c=inputs();c.zdrEndpointSnapshot.data[0].status=1;
 assert.throws(()=>inspectYeoulOpenRouterEndpointEvidence(c),/zdr_endpoint_absent/);
});

test('stale, future and missing snapshots cannot masquerade as current',()=>{
 const a=inputs();a.evaluatedAtEpoch+=3601;
 assert.throws(()=>inspectYeoulOpenRouterEndpointEvidence(a),/stale_future_or_invalid/);
 const b=inputs();b.capturedAtEpoch+=11;
 assert.throws(()=>inspectYeoulOpenRouterEndpointEvidence(b),/stale_future_or_invalid/);
 const c=inputs();c.modelEndpointSnapshot.data.id='other/model';
 assert.throws(()=>inspectYeoulOpenRouterEndpointEvidence(c),/model_endpoint_snapshot_shape/);
});

test('tokens and all requested parameters must be supported by both endpoint listings',()=>{
 const a=inputs();a.maxOutputTokens=2049;
 assert.throws(()=>inspectYeoulOpenRouterEndpointEvidence(a),/endpoint_token_ceiling/);
 const b=inputs();b.requiredParameters.push('tools');
 assert.throws(()=>inspectYeoulOpenRouterEndpointEvidence(b),/required_parameter_not_supported/);
 const c=inputs();c.zdrEndpointSnapshot.data[0].supported_parameters=[];
 assert.throws(()=>inspectYeoulOpenRouterEndpointEvidence(c),/required_parameter_not_supported/);
});

test('invalid, incomplete, negative and imprecise price strings fail closed',()=>{
 for(const invalid of ['-0.01','not_a_price',0.25,'NaN','1e-6']){
   const a=inputs();a.modelEndpointSnapshot.data.endpoints[0].pricing.prompt=invalid;
   assert.throws(()=>inspectYeoulOpenRouterEndpointEvidence(a),/non_decimal_endpoint_price/);
 }
 const b=inputs();delete b.modelEndpointSnapshot.data.endpoints[0].pricing.request;
 assert.throws(()=>inspectYeoulOpenRouterEndpointEvidence(b),/missing_provider_price_component/);
});

test('micro USD quote rounds every tiny per-token price upward; does not claim spend authority',()=>{
 const a=inputs();a.modelEndpointSnapshot.data.endpoints[0].pricing.prompt='0.000000000000000001';
 a.modelEndpointSnapshot.data.endpoints[0].pricing.completion='0.000000000000000001';
 a.modelEndpointSnapshot.data.endpoints[0].pricing.request='0.000000000000000001';
 const x=inspectYeoulOpenRouterEndpointEvidence(a);
 assert.equal(x.promptCompletionRequestOnlyQuoteMicroUsd,'1');
 assert.equal(x.liveRouteActuallyEnforced,false);
});
