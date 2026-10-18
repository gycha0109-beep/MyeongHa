import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  auditM132HistoricalSnapshot,
  evaluateM132DeploymentEvidence,
  M132_PROJECT_ID,
  M132_HISTORIC_CANDIDATE_SHA,
} from '../../../scripts/operations/m1-32-vercel-exact-sha-bundle-evidence.mjs';

const historical=JSON.parse(readFileSync(new URL(
  '../../../scripts/operations/fixtures/m1-32-vercel-readonly-metadata-20261018.snapshot.json',
  import.meta.url,
),'utf8'));
const MATCHING_ID='dpl_M132SyntheticNotDeployed';
const SHA=M132_HISTORIC_CANDIDATE_SHA;
const head={projectId:M132_PROJECT_ID,headSha:SHA};
const deployed={
  id:MATCHING_ID,projectId:M132_PROJECT_ID,commitSha:SHA,
  status:'READY',target:'preview',
};
const file={path:'api/me.func/index.js',sha256:'a'.repeat(64),
  artifactKind:'built-serverless-function'};

function evaluate({deployments=[deployed],fileTreeReads=[
  {deploymentId:MATCHING_ID,status:'available',files:[file]},
]}={}){
  return evaluateM132DeploymentEvidence({
    expected:head,observation:{projectId:M132_PROJECT_ID,deployments,fileTreeReads},
  });
}
function hold(result,verdict){
  expect(result).toMatchObject({
    verdict,bundleProven:false,productionReleaseAuthorized:false,
  });
}
describe('M1-32 Vercel exact SHA and immutable serverless artifact HOLD',()=>{
  it('pins the real read-only observation: current main deploys are NOT M1-31 PR deployment',()=>{
    expect(historical.snapshotKind).toBe('VERCEL_READONLY_DEPLOYMENT_METADATA_ONLY');
    expect(historical.candidateHeadSha).toBe(SHA);
    expect(historical.fileTreeReads.every(x=>x.httpStatus===404)).toBe(true);
    hold(auditM132HistoricalSnapshot(historical),'HOLD_M1_32_NO_EXACT_SHA_DEPLOYMENT');
  });
  it('rejects latest READY main SHA substitution for the actual PR SHA',()=>{
    hold(evaluate({deployments:[{...deployed,commitSha:'f'.repeat(40)}]}),
      'HOLD_M1_32_NO_EXACT_SHA_DEPLOYMENT');
  });
  it('rejects a not-READY exact-head preview deployment',()=>{
    hold(evaluate({deployments:[{...deployed,status:'BUILDING'}]}),
      'HOLD_M1_32_DEPLOYMENT_NOT_READY');
  });
  it('rejects an ambiguous double deployment instead of choosing arbitrary bytes',()=>{
    hold(evaluate({deployments:[deployed,{...deployed,id:'dpl_M132OtherSynthetic'}]}),
      'HOLD_M1_32_AMBIGUOUS_CANDIDATE_DEPLOYMENTS');
  });
  it('rejects 404 file tree even when exact SHA, project, target and READY match',()=>{
    const result=evaluate({fileTreeReads:[{
      deploymentId:MATCHING_ID,status:'unavailable',httpStatus:404,
    }]});
    hold(result,'HOLD_M1_32_VERCEL_FILE_TREE_UNAVAILABLE');
    expect(result.treeHttpStatus).toBe(404);
  });
  it('rejects a Git source-file list as proof of compiled serverless code',()=>{
    hold(evaluate({fileTreeReads:[{
      deploymentId:MATCHING_ID,status:'available',
      files:[{...file,path:'api/me.ts',artifactKind:'git-source'}],
    }]}),'HOLD_M1_32_SERVERLESS_BUNDLE_NOT_ATTESTED');
  });
  it('rejects missing sha256, duplicate names, and path traversal in file evidence',()=>{
    for(const p of [
      {path:'api/me.func/index.js',sha256:'not-a-real-sha'},
      {path:'../secrets.js',sha256:'a'.repeat(64)},
    ])hold(evaluate({fileTreeReads:[{deploymentId:MATCHING_ID,status:'available',files:[p]}]}),
      'HOLD_M1_32_MALFORMED_ARTIFACT_FILE_EVIDENCE');
    hold(evaluate({fileTreeReads:[{
      deploymentId:MATCHING_ID,status:'available',files:[file,file],
    }]}),'HOLD_M1_32_DUPLICATE_ARTIFACT_PATH');
  });
  it('rejects explicit protected Reader module path in a synthetic compiled-function listing',()=>{
    hold(evaluate({fileTreeReads:[{
      deploymentId:MATCHING_ID,status:'available',files:[
        file,
        {...file,path:'apps/api/src/official-reader-unknown-commit-minimal-v1.ts'},
      ],
    }]}),'HOLD_M1_32_PROTECTED_READER_ARTIFACT_LISTED');
  });
  it('does NOT treat a fake built-serverless-function hash label as independent byte attestation',()=>{
    const result=evaluate();
    hold(result,'HOLD_M1_32_BUNDLE_BYTES_AND_ORIGIN_UNVERIFIED');
    expect(result.builtFunctionFileCount).toBe(1);
  });
  it('rejects wrong project or unpinned SHA even if artifacts are otherwise labelled READY',()=>{
    hold(evaluateM132DeploymentEvidence({
      expected:{...head,projectId:'prj_different'},
      observation:{projectId:M132_PROJECT_ID,deployments:[deployed],fileTreeReads:[]},
    }),'HOLD_M1_32_INVALID_EVIDENCE');
    hold(evaluateM132DeploymentEvidence({
      expected:{...head,headSha:'b'.repeat(40)},
      observation:{projectId:M132_PROJECT_ID,deployments:[deployed],fileTreeReads:[]},
    }),'HOLD_M1_32_EXPECTED_SHA_UNPINNED');
  });
});
