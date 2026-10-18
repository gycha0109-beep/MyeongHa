// M1-32: pure read-only deployment artifact evidence admission.
// NEVER calls Vercel, deploys, promotes, requests secrets or authorizes release.
// Evidence origin must be authenticated separately.
export const M132_PROJECT_ID='prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP';
export const M132_HISTORIC_CANDIDATE_SHA='81fa7a2c7387717f7fb8d92d43ef1cc269d38b33';
const SHA=/^[a-f0-9]{40}$/u;
const DEPLOYMENT=/^dpl_[A-Za-z0-9]+$/u;
const DIGEST=/^[a-f0-9]{64}$/u;

const held=(verdict,fields={})=>Object.freeze({
  verdict,bundleProven:false,productionReleaseAuthorized:false,...fields,
});

export function evaluateM132DeploymentEvidence(input) {
  if(!input||typeof input!=='object')
    return held('HOLD_M1_32_INVALID_EVIDENCE');
  const {expected,observation}=input;
  if(!expected||expected.projectId!==M132_PROJECT_ID||
     typeof expected.headSha!=='string'||!SHA.test(expected.headSha)||
     !observation||observation.projectId!==expected.projectId||
     !Array.isArray(observation.deployments)||
     !Array.isArray(observation.fileTreeReads))
    return held('HOLD_M1_32_INVALID_EVIDENCE');
  if(expected.headSha!==M132_HISTORIC_CANDIDATE_SHA&&
     expected.headSha!==input.candidateHeadSha)
    return held('HOLD_M1_32_EXPECTED_SHA_UNPINNED');

  // A main deployment is NOT an artifact for unmerged Draft PR HEAD.
  const matches=observation.deployments.filter(d=>
    d&&d.projectId===expected.projectId&&d.commitSha===expected.headSha&&
    typeof d.id==='string'&&DEPLOYMENT.test(d.id));
  if(matches.length===0)
    return held('HOLD_M1_32_NO_EXACT_SHA_DEPLOYMENT',{
      expectedHeadSha:expected.headSha,
      observedDeploymentCount:observation.deployments.length,
    });
  if(matches.length!==1)
    return held('HOLD_M1_32_AMBIGUOUS_CANDIDATE_DEPLOYMENTS',{
      exactShaDeploymentCount:matches.length,
    });
  const deployment=matches[0];
  const key={deploymentId:deployment.id,commitSha:deployment.commitSha};
  if(deployment.status!=='READY')
    return held('HOLD_M1_32_DEPLOYMENT_NOT_READY',key);
  if(!['preview','production'].includes(deployment.target))
    return held('HOLD_M1_32_UNRECOGNIZED_DEPLOYMENT_TARGET',key);

  const treeReads=observation.fileTreeReads.filter(v=>v&&v.deploymentId===deployment.id);
  if(treeReads.length!==1)
    return held('HOLD_M1_32_FILE_TREE_EVIDENCE_MISSING_OR_AMBIGUOUS',key);
  const tree=treeReads[0];
  if(tree.status!=='available'||!Array.isArray(tree.files)||!tree.files.length)
    return held('HOLD_M1_32_VERCEL_FILE_TREE_UNAVAILABLE',{
      ...key,treeHttpStatus:tree.httpStatus??null,
    });
  if(tree.files.some(f=>!f||typeof f.path!=='string'||!f.path||
    !/^[A-Za-z0-9_.\/\-[\]]+$/u.test(f.path)||
    f.path.startsWith('/')||f.path.split('/').includes('..')||
    typeof f.sha256!=='string'||!DIGEST.test(f.sha256)))
    return held('HOLD_M1_32_MALFORMED_ARTIFACT_FILE_EVIDENCE',key);
  const paths=tree.files.map(f=>f.path);
  if(paths.length!==new Set(paths).size)
    return held('HOLD_M1_32_DUPLICATE_ARTIFACT_PATH',key);

  // The Vercel /v6/deployments/{id}/files endpoint exposes a source file
  // tree for Git deployments, not automatically the built Lambda bundle.
  const compiled=tree.files.filter(f=>f.artifactKind==='built-serverless-function');
  if(compiled.length===0)
    return held('HOLD_M1_32_SERVERLESS_BUNDLE_NOT_ATTESTED',{
      ...key,sourceTreeFileCount:tree.files.length,
    });

  if(tree.files.some(f=>
    /(?:^|\/)(?:official-reader-unknown-commit-minimal-v1|postgres-official-reader-unknown-commit-read-tx-v1)(?:\.|\/)/u.test(f.path)))
    return held('HOLD_M1_32_PROTECTED_READER_ARTIFACT_LISTED',key);

  // Self-declared built-function labels/hashes are not independently
  // authenticated provenance, nor proof that the actual function bytes
  // have been inspected. Keep HOLD even for structurally complete input.
  return held('HOLD_M1_32_BUNDLE_BYTES_AND_ORIGIN_UNVERIFIED',{
    ...key,builtFunctionFileCount:compiled.length,
  });
}

export function auditM132HistoricalSnapshot(snapshot) {
  if(!snapshot||snapshot.snapshotKind!=='VERCEL_READONLY_DEPLOYMENT_METADATA_ONLY')
    return held('HOLD_M1_32_INVALID_SNAPSHOT_KIND');
  return evaluateM132DeploymentEvidence({
    expected:{projectId:M132_PROJECT_ID,headSha:M132_HISTORIC_CANDIDATE_SHA},
    observation:snapshot,
  });
}
