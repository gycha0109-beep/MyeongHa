import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {
 buildSeyeonTerraGlmFailureDiagnosticV1 as diagnostic,
 SEYEON_TERRA_GLM_FAILURE_PHASE_REASONS_V1 as phases,
} from '../scripts/seyeon-terra-glm-failure-diagnostic-v1.mjs';

const scope={caseId:'N06',stage:'unified_preflight_shadow',
 model:'gpt-5.6-luna',route:'luna'};
const build=(phase,httpStatus=null,error=null)=>diagnostic({
 ...scope,phase,httpStatus,error,
});
describe('One-shot public Se-yeon provider failure stage diagnostics (nonbillable)',()=>{
 it('distinguishes HTTP transport, parse, usage, cost, and evidence failure with fixed codes',()=>{
  const names=['provider_origin','transport','http_status','response_parse',
   'usage_validation','cost_validation','observation_write'];
  expect(Object.keys(phases)).toEqual(names);
  for(const phase of names){
   const row=build(phase,200);
   expect(row).toMatchObject({phase,reason:phases[phase],httpStatus:200,
    caseId:'N06',stage:'unified_preflight_shadow',
    model:'gpt-5.6-luna',route:'luna',
    invoiceReconciled:false});
  }
  expect(new Set(names.map(x=>build(x).reason)).size).toBe(names.length);
 });
 it('keeps only preapproved transport cause codes; never serializes errors or secrets',()=>{
  const secret='sk-proj-secret-and-personal-user-text';
  const error=new Error(secret,{cause:Object.assign(new Error('account='+secret),{
   code:'ENOTFOUND',host:secret,authorization:secret,
  })});
  const row=build('transport',null,error);
  expect(row.causeCode).toBe('ENOTFOUND');
  expect(row.httpStatus).toBeNull();
  const serialized=JSON.stringify(row);
  expect(serialized).not.toContain(secret);
  expect(serialized).not.toContain('host');
  expect(serialized).not.toContain('authorization');
  expect(serialized).not.toContain('message');
  expect(serialized).not.toContain('stack');
 });
 it('never echoes arbitrary error codes or free-form response status',()=>{
  const malicious=new Error('Bearer TOKEN');
  malicious.code='SOME_PRIVATE_USER_IDENTIFIER';
  malicious.cause={code:'HTTP_999_PRIVATE',headers:{authorization:'secret'}};
  expect(build('transport',200,malicious).causeCode).toBeNull();
  expect(build('response_parse',200,{
   code:'ENOTFOUND',message:'sk-proj-secret',
  }).causeCode).toBeNull();
  expect(build('http_status',600).httpStatus).toBeNull();
  expect(build('http_status',401.5).httpStatus).toBeNull();
  expect(build('http_status',401).httpStatus).toBe(401);
 });
 it('fails closed when case, stage, model or route diverges from synthetic scope',()=>{
  for(const input of [
   {...scope,phase:'tls'}, {...scope,phase:'transport',caseId:'N01'},
   {...scope,phase:'transport',stage:'integrity_classification'},
   {...scope,phase:'transport',model:'other'},
   {...scope,phase:'transport',route:'glm'},
  ])expect(()=>diagnostic(input)).toThrow();
 });
 it('fixes the prior unbound stage regression in the post-response fetch hook',()=>{
  const script=readFileSync(new URL(
   '../scripts/run-seyeon-terra-glm-quality-trio-v1.mjs',import.meta.url),'utf8');
  const source=script.slice(script.indexOf('fetchImpl:async(url,init)=>{'),
   script.indexOf('const ensureCandidateFinished'));
  expect(source).toContain('stage:expectedStage');
  expect(source).toContain('observedStages.candidate[expectedStage]');
  expect(source).not.toContain('observedStages.candidate[stage]');
  expect(source).not.toMatch(/const observed=\{[^}]*\bstage,model/u);
  expect(source).toContain("await noteFailure('transport',null,error)");
  expect(source).toContain("await noteFailure('response_parse',response.status,error)");
  expect(source).toContain("await noteFailure('usage_validation',response.status)");
  expect(source).toContain("await noteFailure('cost_validation',response.status)");
  expect(source).toContain("await noteFailure('observation_write',response.status,error)");
  expect(script).toContain('reason=failureDiagnostic?.reason??(');
  expect(script).toContain('verdict,reason,failureDiagnostic,mainSha:');
 });
 it('never publishes credentials, prompts, API error response bodies or free-form exceptions',()=>{
  const source=readFileSync(new URL(
   '../scripts/seyeon-terra-glm-failure-diagnostic-v1.mjs',import.meta.url),'utf8');
  expect(source).not.toContain('JSON.stringify(error)');
  expect(source).not.toContain('error.message');
  expect(source).not.toContain('error.stack');
  expect(source).not.toContain('response.body');
  expect(source).not.toContain('requestBody');
  expect(source).not.toContain('Authorization:');
 });
});
