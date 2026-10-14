import { describe,expect,it } from 'vitest';
import {validateEffectiveSnapshot,verifyEffectiveHelperSequence} from '../scripts/operations/verify-seyeon-r2-effective-helper.mjs';
const roles=['api_executor','browser_anon','browser_authenticated','function_owner','server_service'];
const make=()=>{
 const roleResults=Object.fromEntries(roles.map(k=>[k,{
  exists:true,directExecute:k==='function_owner',effectiveExecute:k==='function_owner',
  schemaUsage:true,inheritsOwner:k==='function_owner',canSetOwner:k==='function_owner'
 }]));
 return {schemaVersion:'seyeon-r2-effective-helper-v1',postgresMajor:17,
 functionCount:1,roleResults,originEstablished:false,authorizedForProduction:false,drReady:false};
};
const states=()=>{
 const before=make(),withGrant=structuredClone(before),after=make();
 withGrant.roleResults.server_service.directExecute=true;
 withGrant.roleResults.server_service.effectiveExecute=true;
 return [before,withGrant,after];
};
describe('R2-F effective helper EXECUTE; synthetic only, fail-closed',()=>{
 it('accepts exactly one service grant and a clean rollback without authorizing Production',()=>{
  expect(verifyEffectiveHelperSequence(...states())).toMatchObject({
   status:'PASS_R2_EFFECTIVE_SERVICE_GRANT_DIFF_REPRODUCED',
   observedDifferenceCount:1,rollbackClean:true,authorizedForProduction:false,drReady:false,
   grantNecessityEstablished:false,historicalActorEstablished:false
  });
 });
 it('rejects missing/invalid role metadata and unexpected flags',()=>{
  const a=make();delete a.roleResults.browser_anon;
  expect(()=>validateEffectiveSnapshot(a)).toThrow('HOLD_R2_EFFECTIVE_HELPER_INVALID_METADATA');
  const b=make();b.roleResults.api_executor.effectiveExecute='yes';
  expect(()=>validateEffectiveSnapshot(b)).toThrow('HOLD_R2_EFFECTIVE_HELPER_INVALID_ROLE_CATEGORY');
  const c=make();c.drReady=true;
  expect(()=>validateEffectiveSnapshot(c)).toThrow('HOLD_R2_EFFECTIVE_HELPER_INVALID_METADATA');
 });
 it('rejects a grant that is not actually effective or direct',()=>{
  let x=states();x[1].roleResults.server_service.effectiveExecute=false;
  expect(()=>verifyEffectiveHelperSequence(...x)).toThrow('HOLD_R2_EFFECTIVE_HELPER_GRANT_NOT_EFFECTIVE');
  x=states();x[1].roleResults.server_service.directExecute=false;
  expect(()=>verifyEffectiveHelperSequence(...x)).toThrow('HOLD_R2_EFFECTIVE_HELPER_GRANT_NOT_EFFECTIVE');
 });
 it('rejects any browser or API effective EXECUTE escalation',()=>{
  for(const role of ['api_executor','browser_anon','browser_authenticated']){
   const x=states();x[1].roleResults[role].effectiveExecute=true;
   expect(()=>verifyEffectiveHelperSequence(...x)).toThrow('HOLD_R2_EFFECTIVE_HELPER_UNRELATED_ROLE_DRIFT');
  }
 });
 it('rejects owner membership shifts, accessible baseline and schema barriers',()=>{
  let x=states();x[1].roleResults.server_service.inheritsOwner=true;
  expect(()=>verifyEffectiveHelperSequence(...x)).toThrow('HOLD_R2_EFFECTIVE_HELPER_UNEXPECTED_OWNER_MEMBERSHIP_PATH');
  x=states();x[0].roleResults.server_service.directExecute=true;
  expect(()=>verifyEffectiveHelperSequence(...x)).toThrow('HOLD_R2_EFFECTIVE_HELPER_ROLLBACK_DRIFT');
  x=states();x[1].roleResults.api_executor.schemaUsage=false;
  expect(()=>verifyEffectiveHelperSequence(...x)).toThrow('HOLD_R2_EFFECTIVE_HELPER_SCHEMA_NOT_ACCESSIBLE');
 });
 it('rejects rollback drift even if added service EXECUTE survived',()=>{
  const x=states();x[2].roleResults.server_service.directExecute=true;
  expect(()=>verifyEffectiveHelperSequence(...x)).toThrow('HOLD_R2_EFFECTIVE_HELPER_ROLLBACK_DRIFT');
 });
});
