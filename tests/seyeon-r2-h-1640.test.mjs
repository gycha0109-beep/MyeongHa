import {describe,it,expect} from 'vitest';
import {validateG1PinState,verifyG1PinSequence} from '../scripts/operations/verify-seyeon-r2-h-1640.mjs';
const base=()=>({
 schemaVersion:'seyeon-r2-h-1640-zero-source-pg17-v1',pgMajor:17,
 attemptTableCount:1,pinColumnCount:0,pinColumnsCorrectTypes:0,pinShapeCheckCount:0,
 pinTriggerCount:0,pinTriggerBeforeUpdate:null,pinTriggerInvokerHardened:null,
 pinnedFunctionCount:0,pinnedOwnerAndDefiner:null,pinnedApiExecutor:null,
 pinnedBrowserServiceExecutor:null,legacyFunctionCount:1,legacyApiExecutor:true,
 legacyBrowserServiceExecutor:false,legacyDdlSha256:'a'.repeat(64),
 legacyOwnerSha256:'b'.repeat(64),legacyAclSha256:'c'.repeat(64),
 ownerRoleCount:1,ownerRoleNonLoginNonBypass:true,creatorDirectMembershipCount:0,
 ownerSchemaCreate:false,reviewUnit:'g1-memory-pin',authorizedForProduction:false,
 g1PositiveAdmissionAllowed:false,drReady:false
});
const rows=()=>{
 const a=base(),b=structuredClone(a),c=structuredClone(a);
 Object.assign(b,{pinColumnCount:2,pinColumnsCorrectTypes:2,pinShapeCheckCount:1,
  pinTriggerCount:1,pinTriggerBeforeUpdate:true,pinTriggerInvokerHardened:true,
  pinnedFunctionCount:1,pinnedOwnerAndDefiner:true,pinnedApiExecutor:true,
  pinnedBrowserServiceExecutor:false,legacyApiExecutor:false,
  legacyAclSha256:'d'.repeat(64)});
 return [a,b,{schemaVersion:'seyeon-r2-h-1640-trigger-synthetic-v1',
  runningPinAccepted:true,unPinnedCommitBlocked:true,nonRunningPinBlocked:true,
  provenanceMismatchBlocked:true,validZeroCommitAccepted:true,
  malformedMissingRecordsCommitAccepted:true,productionWrites:0},c];
};
describe('R2-H 1640 zero personal source proof and defensive trigger',()=>{
 it('records bounded synthetic NULL-records acceptance as an explicit HOLD, not release PASS',()=>{
  expect(verifyG1PinSequence(...rows())).toMatchObject({
   status:'HOLD_R2_H_1640_TRIGGER_NULL_RECORDS_COMMIT_GAP_REPRODUCED',
   rollbackClean:true,authorizedForProduction:false,drReady:false
  });
 });
 it('accepts stronger missing-record guard only under separate Owner HOLD',()=>{
  const s=rows();s[2].malformedMissingRecordsCommitAccepted=false;
  expect(verifyG1PinSequence(...s).status).toBe('HOLD_R2_H_1640_SOURCE_AND_OWNER_RELEASE_REVIEW');
 });
 it('rejects early schema application and missing new columns/shape/trigger',()=>{
  for(const [idx,key,value] of [[0,'pinColumnCount',1],[1,'pinColumnCount',1],
   [1,'pinColumnsCorrectTypes',1],[1,'pinShapeCheckCount',0],
   [1,'pinTriggerCount',0]]){
   const s=rows();s[idx][key]=value;expect(()=>verifyG1PinSequence(...s)).toThrow();
  }
 });
 it('rejects privilege exposure, trigger disable and unapproved creator membership',()=>{
  for(const [idx,key,value] of [[1,'pinTriggerBeforeUpdate',false],
   [1,'pinnedApiExecutor',false],[1,'pinnedBrowserServiceExecutor',true],
   [1,'legacyApiExecutor',true],[1,'creatorDirectMembershipCount',1]]){
   const s=rows();s[idx][key]=value;expect(()=>verifyG1PinSequence(...s)).toThrow();
  }
 });
 it('rejects old function body/owner change or missing narrowed ACL',()=>{
  for(const [key,value] of [['legacyDdlSha256','f'.repeat(64)],
   ['legacyOwnerSha256','f'.repeat(64)],['legacyAclSha256','c'.repeat(64)]]){
   const s=rows();s[1][key]=value;expect(()=>verifyG1PinSequence(...s)).toThrow('LEGACY_REVOKE_DDL_OR_OWNER_DRIFT');
  }
 });
 it('rejects rollback drift and all asserted false approval or new evidence fields',()=>{
  let s=rows();s[3].pinColumnCount=1;
  expect(()=>verifyG1PinSequence(...s)).toThrow();
  s=rows();s[1].drReady=true;
  expect(()=>verifyG1PinSequence(...s)).toThrow('EVIDENCE_SCOPE');
  s=rows();s[2].personalRecord='forbidden';
  expect(()=>verifyG1PinSequence(...s)).toThrow('TRIGGER_SYNTHETIC_DRIFT');
 });
 it('rejects missing positive/negative synthetic evidence',()=>{
  for(const k of ['runningPinAccepted','unPinnedCommitBlocked','nonRunningPinBlocked',
   'provenanceMismatchBlocked','validZeroCommitAccepted']){
   const s=rows();s[2][k]=false;expect(()=>verifyG1PinSequence(...s)).toThrow('TRIGGER_SYNTHETIC_DRIFT');
  }
 });
 it('rejects fabricated pre-owner and invalid stage',()=>{
  const s=rows();s[0].ownerRoleCount=0;
  expect(()=>verifyG1PinSequence(...s)).toThrow('BASELINE_AUTHORITY_DRIFT');
  expect(()=>validateG1PinState(rows()[1],'later')).toThrow('BAD_STAGE');
 });
});
