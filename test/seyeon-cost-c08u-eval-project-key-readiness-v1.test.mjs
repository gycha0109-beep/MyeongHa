import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {
 SEYEON_C08U_READONLY_MODEL_URL_V1 as MODEL_URL,
 verifySeyeonC08UEvaluationCredentialV1 as verify,
} from '../scripts/seyeon-cost-c08u-eval-project-key-readiness-v1.mjs';
import {
 SEYEON_C08T_FIRST_PAID_PILOT_POLICY_V1 as POLICY,
} from '../scripts/seyeon-cost-c08t-owner-budget-pilot-v1.mjs';

const key='sk-proj-'+('SYNTHETIC_NOT_A_REAL_KEY_0000000000000000000000');
const response=(id=POLICY.model)=>new Response(
 JSON.stringify({id,object:'model',created:123,owned_by:'synthetic'}),
 {status:200,headers:{'content-type':'application/json'}});

describe('C08-U isolated evaluation key credential GET only, NO paid call',()=>{
 it('makes exactly one pinned HTTPS GET without inference, existing service key, or body',async()=>{
  const fetchImpl=vi.fn(async()=>response());
  const result=await verify({key,fetchImpl});
  expect(result).toEqual({
   schemaVersion:'seyeon-c08u-eval-credential-readiness-v1',
   scope:'CREDENTIAL_MODEL_GET_ONLY_NOT_BILLING_OR_PAID_APPROVAL',
   result:'MODEL_GET_ACCESSIBLE',reason:null,paidDispatchEnabled:false,
   projectIdentityVerified:false,providerHardLimitVerified:false,
   invoiceReconciled:false,
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const [url,options]=fetchImpl.mock.calls[0];
  expect(url).toBe('https://api.openai.com/v1/models/'+POLICY.model);
  expect(url).toBe(MODEL_URL);
  expect(options.method).toBe('GET');
  expect(options.redirect).toBe('error');
  expect(options.headers.Authorization).toBe('Bearer '+key);
  expect(options.body).toBeUndefined();
  expect(JSON.stringify(result)).not.toContain(key);
 });
 it('fails closed for absent, malformed or different-scope secret without network',async()=>{
  const fetchImpl=vi.fn(async()=>response());
  for(const bad of [
   undefined,'','sk-test-'+('x'.repeat(40)),
   'sk-proj-'+('x'.repeat(40))+' ',
   'sk-proj-'+('x'.repeat(40))+'\\nInjected:evil',
  ]){
   const r=await verify({key:bad,fetchImpl});
   expect(r.result).toBe('HOLD');
   expect(r.paidDispatchEnabled).toBe(false);
  }
  expect(fetchImpl).not.toHaveBeenCalled();
 });
 it('does not parse or disclose upstream 401, 403, 404, or 429 error bodies',async()=>{
  for(const status of [401,403,404,429]){
   const privateMessage='UPSTREAM_UNTRUSTED_PRIVATE_OR_KEY';
   const fetchImpl=vi.fn(async()=>new Response(privateMessage,{status}));
   const r=await verify({key,fetchImpl});
   expect(r.reason).toBe('MODEL_GET_NOT_AVAILABLE_OR_NOT_AUTHORIZED');
   expect(JSON.stringify(r)).not.toContain(privateMessage);
   expect(JSON.stringify(r)).not.toContain(key);
  }
 });
 it('rejects invalid model metadata, oversized response and transport failure',async()=>{
  for(const impl of [
   async()=>response('wrong-model'),
   async()=>new Response(JSON.stringify({id:POLICY.model,object:'not-model'}),{status:200}),
   async()=>new Response('x'.repeat(8200),{status:200}),
   async()=>new Response('bad-json',{status:200}),
   async()=>{throw Error('do not leak PRIVATE token');},
  ]){
   const r=await verify({key,fetchImpl:impl});
   expect(r.result).toBe('HOLD');
   expect(r.paidDispatchEnabled).toBe(false);
   expect(JSON.stringify(r)).not.toContain('PRIVATE');
  }
 });
 it('ensures GitHub workflow takes only new evaluation secret and has no paid model invocation',()=>{
  const workflow=readFileSync(new URL(
   '../.github/workflows/seyeon-c08u-eval-project-key-readiness-v1.yml',
   import.meta.url),'utf8');
  const runner=readFileSync(new URL(
   '../scripts/seyeon-cost-c08u-eval-project-key-readiness-v1.mjs',
   import.meta.url),'utf8');
  expect(workflow).toContain('secrets.OPENAI_EVAL_API_KEY');
  expect(workflow).not.toContain('secrets.OPENAI_API_KEY');
  expect(workflow).toContain('environment: production');
  expect(workflow).toContain("github.ref == 'refs/heads/main'");
  expect(workflow).toContain('node scripts/seyeon-cost-c08u-eval-project-key-readiness-v1.mjs');
  expect(workflow).not.toContain('run-seyeon-cost-c07-six-call-v1.mjs');
  expect(workflow).not.toContain('run-seyeon-dialogue-path-real-api-eval');
  expect(runner).not.toContain("'/v1/responses'");
  expect(runner).not.toContain("method:'POST'");
  expect(runner).not.toContain('createOpenAiSeyeonStructuredProviderV1');
  expect(POLICY.paidDispatchEnabled).toBe(false);
 });
});
